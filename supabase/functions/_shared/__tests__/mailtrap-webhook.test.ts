import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createMailtrapWebhookHandler, type DeliveryUpdate, deliveryUpdatesFromEvents, type SuppressionWrite, suppressionsFromEvents } from '../mailtrap-webhook.ts'

const SECRET = 'whsec-test'

async function sign(body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function harness({ failSuppress = false, failDelivery = false, knownMessages = ['m1', 'm2', 'm3'] } = {}) {
  const suppressed: SuppressionWrite[] = []
  const flagged: string[] = []
  const deliveries: DeliveryUpdate[] = []
  const handler = createMailtrapWebhookHandler({
    secret: SECRET,
    suppress: (w) => (failSuppress ? Promise.reject(new Error('db down')) : (suppressed.push(w), Promise.resolve())),
    flagBouncedLead: (email) => (flagged.push(email), Promise.resolve()),
    recordDelivery: (u) => {
      if (failDelivery) return Promise.reject(new Error('db down'))
      deliveries.push(u)
      return Promise.resolve(knownMessages.includes(u.messageId) ? 1 : 0)
    },
  })
  return { handler, suppressed, flagged, deliveries }
}

async function post(handler: (r: Request) => Promise<Response>, events: unknown[], signature?: string) {
  const body = JSON.stringify({ events })
  return handler(new Request('https://x/mailtrap-bounce-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Mailtrap-Signature': signature ?? (await sign(body)) },
    body,
  }))
}

Deno.test('bounce -> hard_bounce scope all, for any address (not only leads), and still flags the lead', async () => {
  const { handler, suppressed, flagged } = harness()
  const res = await post(handler, [{ event: 'bounce', email: ' Some.Body@Gmail.com ', message_id: 'm1', event_id: 'e1' }])
  assertEquals(res.status, 200)
  assertEquals(suppressed, [{ email: 'some.body@gmail.com', reason: 'hard_bounce', scope: 'all', providerEventId: 'e1' }])
  assertEquals(flagged, ['some.body@gmail.com'])
})

Deno.test('spam -> spam_complaint scope all', async () => {
  const { handler, suppressed, flagged } = harness()
  await post(handler, [{ event: 'spam', email: 'angry@example.com', message_id: 'm2' }])
  assertEquals(suppressed, [{ email: 'angry@example.com', reason: 'spam_complaint', scope: 'all', providerEventId: 'm2' }])
  assertEquals(flagged, [])
})

Deno.test('unsubscribe -> unsubscribe scope marketing', async () => {
  const { handler, suppressed } = harness()
  await post(handler, [{ event: 'unsubscribe', email: 'done@example.com' }])
  assertEquals(suppressed, [{ email: 'done@example.com', reason: 'unsubscribe', scope: 'marketing', providerEventId: null }])
})

Deno.test('every other event is ignored for suppression (delivery included)', async () => {
  const { handler, suppressed, flagged, deliveries } = harness()
  const res = await post(handler, ['delivery', 'open', 'click', 'soft bounce', 'soft_bounce', 'suspension', 'reject'].map((event) => ({ event, email: 'x@example.com', message_id: 'm1' })))
  assertEquals(res.status, 200)
  assertEquals(suppressed, [])
  assertEquals(flagged, [])
  assertEquals(deliveries.map((d) => d.status), ['delivered'], 'only delivery touches the send log')
})

// --- send-log status updates (step 3) ---

Deno.test('delivery updates email_events only: delivered + timestamp, no suppression', async () => {
  const { handler, suppressed, deliveries } = harness()
  const res = await post(handler, [{ event: 'delivery', email: 'ok@example.com', message_id: 'm1', timestamp: 1763632800 }])
  assertEquals(res.status, 200)
  assertEquals(suppressed, [])
  assertEquals(deliveries, [{ messageId: 'm1', status: 'delivered', at: '2025-11-20T10:00:00.000Z' }])
  assertEquals((await res.json()).statusUpdated, 1)
})

Deno.test('bounce and spam update the send log as well as suppressing', async () => {
  const { handler, suppressed, deliveries } = harness()
  await post(handler, [
    { event: 'bounce', email: 'a@x.com', message_id: 'm2' },
    { event: 'spam', email: 'b@x.com', message_id: 'm3' },
  ])
  assertEquals(suppressed.map((w) => w.reason), ['hard_bounce', 'spam_complaint'])
  assertEquals(deliveries.map((d) => `${d.messageId}:${d.status}:${d.at}`), ['m2:bounced:null', 'm3:complained:null'])
})

Deno.test('unknown message_id is not an error', async () => {
  const { handler } = harness({ knownMessages: [] })
  const res = await post(handler, [{ event: 'delivery', email: 'x@y.com', message_id: 'never-logged' }])
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.unknownMessages, 1)
  assertEquals(body.failed, 0)
})

Deno.test('a failed send-log write returns 500 for a redelivery', async () => {
  const { handler } = harness({ failDelivery: true })
  assertEquals((await post(handler, [{ event: 'delivery', email: 'x@y.com', message_id: 'm1' }])).status, 500)
})

Deno.test('delivery updates need a message_id and dedupe per (message, status)', () => {
  assertEquals(
    deliveryUpdatesFromEvents([
      { event: 'delivery', message_id: 'm1' },
      { event: 'delivery', message_id: 'm1' },
      { event: 'spam', message_id: 'm1' },
      { event: 'delivery' },
      { event: 'open', message_id: 'm1' },
      { event: 'unsubscribe', message_id: 'm1' },
    ]).map((u) => `${u.messageId}:${u.status}`),
    ['m1:delivered', 'm1:complained'],
  )
})

Deno.test('mapping dedupes per (address, reason) and drops events without a usable address', () => {
  assertEquals(
    suppressionsFromEvents([
      { event: 'bounce', email: 'A@x.com' },
      { event: 'bounce', email: 'a@x.com' },
      { event: 'spam', email: 'a@x.com' },
      { event: 'bounce' },
      { event: 'bounce', email: 'not-an-address' },
      { event: 42, email: 'b@x.com' },
    ]).map((w) => `${w.email}:${w.reason}`),
    ['a@x.com:hard_bounce', 'a@x.com:spam_complaint'],
  )
})

Deno.test('invalid or missing signature is rejected before any write', async () => {
  const { handler, suppressed } = harness()
  const events = [{ event: 'bounce', email: 'a@x.com' }]
  assertEquals((await post(handler, events, 'deadbeef')).status, 401)
  assertEquals((await post(handler, events, await sign(JSON.stringify({ events }), 'wrong-secret'))).status, 401)
  const noSig = await handler(new Request('https://x', { method: 'POST', body: JSON.stringify({ events }) }))
  assertEquals(noSig.status, 401)
  assertEquals(suppressed, [])
})

Deno.test('a failed suppression write returns 500 so Mailtrap redelivers (writes are idempotent)', async () => {
  const { handler, flagged } = harness({ failSuppress: true })
  const res = await post(handler, [{ event: 'bounce', email: 'a@x.com' }])
  assertEquals(res.status, 500)
  assertEquals((await res.json()).failed, 1)
  assertEquals(flagged, ['a@x.com'])
})

Deno.test('missing webhook secret rejects', async () => {
  const handler = createMailtrapWebhookHandler({
    secret: undefined,
    suppress: () => Promise.resolve(),
    flagBouncedLead: () => Promise.resolve(),
    recordDelivery: () => Promise.resolve(0),
  })
  const res = await handler(new Request('https://x', { method: 'POST', body: '{}' }))
  assertEquals(res.status, 401)
})
