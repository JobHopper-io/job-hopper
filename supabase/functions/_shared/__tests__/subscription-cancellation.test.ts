import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { cancellationPatch } from '../subscription-cancellation.ts'

const T1 = 1795000000 // 2026-11-18T...
const T2 = 1797600000

Deno.test('stores every cancellation field Stripe sends', () => {
  assertEquals(
    cancellationPatch({
      canceled_at: T1,
      cancel_at_period_end: true,
      cancel_at: T2,
      cancellation_details: { reason: 'cancellation_requested', feedback: 'too_expensive', comment: '  Found a cheaper tool  ' },
    }),
    {
      canceled_at: new Date(T1 * 1000).toISOString(),
      cancel_at_period_end: true,
      cancel_at: new Date(T2 * 1000).toISOString(),
      cancellation_reason: 'cancellation_requested',
      cancellation_feedback: 'too_expensive',
      cancellation_comment: 'Found a cheaper tool',
    },
  )
})

Deno.test('nulls and blanks are left out of the patch', () => {
  assertEquals(
    cancellationPatch({ canceled_at: null, cancel_at: null, cancellation_details: { reason: null, feedback: null, comment: '   ' } }),
    {},
  )
  assertEquals(cancellationPatch({}), {})
  assertEquals(cancellationPatch({ cancellation_details: null }), {})
})

Deno.test('a later event with nulls does not overwrite stored values', () => {
  // Same merge the webhook does: update({ status, ...cancellationPatch(sub) }).
  let stored: Record<string, unknown> = {}
  stored = { ...stored, ...cancellationPatch({ canceled_at: T1, cancel_at_period_end: true, cancel_at: T2, cancellation_details: { reason: 'cancellation_requested', feedback: 'missing_features', comment: 'needs X' } }) }
  const snapshot = { ...stored }
  // customer.subscription.deleted: Stripe often sends details without feedback/comment.
  stored = { ...stored, ...cancellationPatch({ canceled_at: null, cancel_at: null, cancel_at_period_end: false, cancellation_details: { reason: null, feedback: null, comment: null } }) }
  assertEquals(stored, { ...snapshot, cancel_at_period_end: false })
})

Deno.test('cancel_at_period_end false is a value, not a null, and is stored', () => {
  assertEquals(cancellationPatch({ cancel_at_period_end: false }), { cancel_at_period_end: false })
})

Deno.test('comment is capped', () => {
  const patch = cancellationPatch({ cancellation_details: { comment: 'x'.repeat(5000) } })
  assertEquals(patch.cancellation_comment?.length, 2000)
})

Deno.test('webhook applies the patch on subscription.updated and .deleted', async () => {
  const src = await Deno.readTextFile(new URL('../../stripe-webhook/index.ts', import.meta.url))
  assert(src.includes('...cancellationPatch(expanded),'))
  assert(src.includes(".update({ status: 'canceled', ...cancellationPatch(stripeSub) })"))
})
