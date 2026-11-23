import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { ilikeExact } from '../email-match.ts'
import { createReplyIngestHandler, type ReplyEventInsert } from '../reply-ingest.ts'

function harness({
  leads = {} as Record<string, string>,
  prospects = {} as Record<string, string>,
  failLookup = false,
  authorized = true,
} = {}) {
  const inserted: ReplyEventInsert[] = []
  const prospectLookups: string[] = []
  const handler = createReplyIngestHandler({
    isAuthorized: () => authorized,
    findLeadIdByEmail: (email) =>
      failLookup ? Promise.reject(new Error('db down')) : Promise.resolve(leads[email.toLowerCase()] ?? null),
    findProspectIdByEmail: (normalized) => (prospectLookups.push(normalized), Promise.resolve(prospects[normalized] ?? null)),
    insertReply: (row) => (inserted.push(row), Promise.resolve(`reply-${inserted.length}`)),
    now: () => new Date('2026-11-21T09:00:00Z'),
  })
  return { handler, inserted, prospectLookups }
}

const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(new Request('https://x/reply-ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

Deno.test('a reply from a prospect is stored with prospect_id (normalized lookup)', async () => {
  const { handler, inserted, prospectLookups } = harness({ prospects: { 'seeker@gmail.com': 'p-1' } })
  const res = await post(handler, { fromEmail: '  Seeker@Gmail.COM ', subject: 'Re: hi', body: 'interested' })
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { id: 'reply-1', matchedLeadId: null, matchedProspectId: 'p-1' })
  assertEquals(prospectLookups, ['seeker@gmail.com'])
  assertEquals(inserted[0], {
    institutional_lead_id: null,
    prospect_id: 'p-1',
    from_email: 'Seeker@Gmail.COM',
    raw_subject: 'Re: hi',
    raw_body: 'interested',
    received_at: '2026-11-21T09:00:00.000Z',
  })
})

Deno.test('a reply from an institutional lead keeps institutional_lead_id; both can match', async () => {
  const { handler, inserted } = harness({ leads: { 'dean@uni.edu': 'lead-1' }, prospects: { 'dean@uni.edu': 'p-9' } })
  await post(handler, { fromEmail: 'dean@uni.edu', receivedAt: '2026-11-20T10:00:00Z' })
  assertEquals(inserted[0].institutional_lead_id, 'lead-1')
  assertEquals(inserted[0].prospect_id, 'p-9')
  assertEquals(inserted[0].received_at, '2026-11-20T10:00:00Z')
})

Deno.test('an unknown sender is stored with no match', async () => {
  const { handler, inserted } = harness()
  const res = await post(handler, { fromEmail: 'stranger@example.com' })
  assertEquals(res.status, 200)
  assertEquals([inserted[0].institutional_lead_id, inserted[0].prospect_id], [null, null])
})

Deno.test('request validation and failures', async () => {
  assertEquals((await post(harness({ authorized: false }).handler, { fromEmail: 'a@b.com' })).status, 401)
  assertEquals((await post(harness().handler, { subject: 'no sender' })).status, 400)
  assertEquals((await harness().handler(new Request('https://x', { method: 'POST', body: 'not json' }))).status, 400)
  assertEquals((await harness().handler(new Request('https://x', { method: 'GET' }))).status, 405)
  const failing = harness({ failLookup: true })
  assertEquals((await post(failing.handler, { fromEmail: 'a@b.com' })).status, 500)
  assertEquals(failing.inserted.length, 0)
})

Deno.test('ilikeExact escapes ILIKE wildcards so "_" and "%" match only themselves', () => {
  assertEquals(ilikeExact('a_b@x.com'), 'a\\_b@x.com')
  assertEquals(ilikeExact('100%@x.com'), '100\\%@x.com')
  assertEquals(ilikeExact('back\\slash@x.com'), 'back\\\\slash@x.com')
  assertEquals(ilikeExact('plain@x.com'), 'plain@x.com')
})
