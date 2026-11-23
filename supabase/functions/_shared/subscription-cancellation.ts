/**
 * Cancellation fields copied from a Stripe subscription onto public.subscriptions
 * (migration 20261123120000). Stripe fills cancellation_details when the customer
 * cancels in the billing portal (reason/feedback/comment) or on payment failure (reason).
 */

export interface StripeCancellationSource {
  canceled_at?: number | null
  cancel_at_period_end?: boolean | null
  cancel_at?: number | null
  cancellation_details?: {
    reason?: string | null
    feedback?: string | null
    comment?: string | null
  } | null
}

export interface CancellationPatch {
  canceled_at?: string
  cancel_at_period_end?: boolean
  cancel_at?: string
  cancellation_reason?: string
  cancellation_feedback?: string
  cancellation_comment?: string
}

const MAX_COMMENT = 2000
const iso = (unix: number | null | undefined) => (typeof unix === 'number' && unix > 0 ? new Date(unix * 1000).toISOString() : undefined)
const text = (v: string | null | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/**
 * Only fields Stripe actually has a value for: a null on a later event (e.g. Stripe
 * clearing cancel_at when a customer resumes) never wipes what was stored.
 * ponytail: so a resumed subscription keeps its old canceled_at/cancel_at; status and
 * cancel_at_period_end=false still show it's live. Add explicit clearing if that matters.
 */
export function cancellationPatch(sub: StripeCancellationSource): CancellationPatch {
  const patch: CancellationPatch = {}
  const canceledAt = iso(sub.canceled_at)
  if (canceledAt) patch.canceled_at = canceledAt
  if (typeof sub.cancel_at_period_end === 'boolean') patch.cancel_at_period_end = sub.cancel_at_period_end
  const cancelAt = iso(sub.cancel_at)
  if (cancelAt) patch.cancel_at = cancelAt
  const reason = text(sub.cancellation_details?.reason)
  if (reason) patch.cancellation_reason = reason
  const feedback = text(sub.cancellation_details?.feedback)
  if (feedback) patch.cancellation_feedback = feedback
  const comment = text(sub.cancellation_details?.comment)
  if (comment) patch.cancellation_comment = comment.slice(0, MAX_COMMENT)
  return patch
}
