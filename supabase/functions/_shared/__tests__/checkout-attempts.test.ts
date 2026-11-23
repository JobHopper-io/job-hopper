import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  type CheckoutAttemptsDb,
  markCheckoutCompleted,
  markCheckoutExpired,
  recordCheckoutStarted,
} from '../checkout-attempts.ts'

const PROFILE = '11111111-2222-4333-8444-555555555555'
const SESSION = 'cs_test_123'

type Row = Record<string, unknown>

/** In-memory checkout_attempts keyed by session id, with an optional forced error. */
function fakeDb(opts: { error?: string; throws?: boolean } = {}) {
  const rows = new Map<string, Row>()
  const calls: { op: string; args: unknown[] }[] = []
  const err = opts.error ? { message: opts.error } : null
  const db: CheckoutAttemptsDb = {
    from: () => ({
      upsert(row, options) {
        calls.push({ op: 'upsert', args: [row, options] })
        if (opts.throws) throw new Error('network down')
        if (!err) rows.set(row.stripe_checkout_session_id as string, { ...rows.get(row.stripe_checkout_session_id as string), ...row })
        return Promise.resolve({ error: err })
      },
      update(patch) {
        return {
          eq: (c1, v1) => ({
            eq: (c2, v2) => ({
              select: () => {
                calls.push({ op: 'update', args: [patch, c1, v1, c2, v2] })
                if (err) return Promise.resolve({ data: null, error: err })
                const hit = [...rows.values()].filter((r) => r[c1] === v1 && r[c2] === v2)
                for (const r of hit) Object.assign(r, patch)
                return Promise.resolve({ data: hit.map(() => ({ id: 'x' })), error: null })
              },
            }),
          }),
        }
      },
    }),
  }
  return { db, rows, calls }
}

const NOW = new Date('2026-11-23T10:00:00.000Z')

Deno.test('started: upserts a started row keyed on the session id', async () => {
  const { db, rows, calls } = fakeDb()
  assertEquals(await recordCheckoutStarted(db, PROFILE, SESSION), true)
  assertEquals(rows.get(SESSION), { profile_id: PROFILE, stripe_checkout_session_id: SESSION, status: 'started' })
  assertEquals(calls[0].args[1], { onConflict: 'stripe_checkout_session_id' })
})

Deno.test('started: a DB error or a thrown client never blocks checkout', async () => {
  assertEquals(await recordCheckoutStarted(fakeDb({ error: 'permission denied' }).db, PROFILE, SESSION), false)
  assertEquals(await recordCheckoutStarted(fakeDb({ throws: true }).db, PROFILE, SESSION), false)
})

Deno.test('completed: marks the started row completed with completed_at', async () => {
  const { db, rows } = fakeDb()
  await recordCheckoutStarted(db, PROFILE, SESSION)
  await markCheckoutCompleted(db, PROFILE, SESSION, NOW)
  assertEquals(rows.get(SESSION)?.status, 'completed')
  assertEquals(rows.get(SESSION)?.completed_at, '2026-11-23T10:00:00.000Z')
})

Deno.test('completed: recorded even when the started write was missed', async () => {
  const { db, rows } = fakeDb()
  await markCheckoutCompleted(db, PROFILE, SESSION, NOW)
  assertEquals(rows.get(SESSION)?.status, 'completed')
  assertEquals(rows.get(SESSION)?.profile_id, PROFILE)
})

Deno.test('completed: a DB error throws so the webhook retries', async () => {
  await assertRejects(() => markCheckoutCompleted(fakeDb({ error: 'timeout' }).db, PROFILE, SESSION, NOW), Error, 'mark completed: timeout')
})

Deno.test('expired: flips only started -> expired', async () => {
  const { db, rows, calls } = fakeDb()
  await recordCheckoutStarted(db, PROFILE, SESSION)
  assertEquals(await markCheckoutExpired(db, SESSION), 1)
  assertEquals(rows.get(SESSION)?.status, 'expired')
  assertEquals(calls.at(-1)?.args, [{ status: 'expired' }, 'stripe_checkout_session_id', SESSION, 'status', 'started'])
})

Deno.test('expired: a completed session is left alone; no row is a no-op', async () => {
  const { db, rows } = fakeDb()
  await markCheckoutCompleted(db, PROFILE, SESSION, NOW)
  assertEquals(await markCheckoutExpired(db, SESSION), 0)
  assertEquals(rows.get(SESSION)?.status, 'completed')
  assertEquals(await markCheckoutExpired(db, 'cs_unknown'), 0)
})

Deno.test('expired: a DB error throws so the webhook retries', async () => {
  await assertRejects(() => markCheckoutExpired(fakeDb({ error: 'timeout' }).db, SESSION), Error, 'mark expired: timeout')
})

// The handlers aren't injectable, so check the wiring in the source.
const webhookSrc = await Deno.readTextFile(new URL('../../stripe-webhook/index.ts', import.meta.url))
const checkoutSrc = await Deno.readTextFile(new URL('../../create-checkout-session/index.ts', import.meta.url))

Deno.test('webhook: no test-mode secret fallback; one signature check against the live secret', () => {
  assertEquals(webhookSrc.includes('STRIPE_WEBHOOK_SECRET_TEST'), false)
  assertEquals(webhookSrc.match(/constructEventAsync\(/g)?.length, 1)
  assert(/constructEventAsync\(\s*body,\s*signature,\s*webhookSecret,/.test(webhookSrc))
})

Deno.test('webhook: expired is a handled type and both checkout events update checkout_attempts', () => {
  const handled = webhookSrc.match(/HANDLED_TYPES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
  assert(handled.includes("'checkout.session.expired'"))
  assert(/case 'checkout\.session\.expired':[\s\S]*?await markCheckoutExpired\(supabaseAdmin, session\.id\)/.test(webhookSrc))
  const completed = webhookSrc.slice(webhookSrc.indexOf("case 'checkout.session.completed'"), webhookSrc.indexOf("case 'checkout.session.expired'"))
  assert(completed.includes('await markCheckoutCompleted(supabaseAdmin, profileId, session.id, new Date())'))
})

Deno.test('create-checkout-session: records started after the session is created, before responding', () => {
  const created = checkoutSrc.indexOf('stripe.checkout.sessions.create(')
  const recorded = checkoutSrc.indexOf('await recordCheckoutStarted(supabaseAdmin, profile.id, session.id)')
  const responded = checkoutSrc.indexOf('JSON.stringify({ sessionId: session.id, url: session.url })')
  assert(created > 0 && recorded > created && responded > recorded)
})
