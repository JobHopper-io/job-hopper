/**
 * checkout_attempts tracking (migration 20260906130000): a row per Stripe Checkout
 * session, 'started' when create-checkout-session creates it, then 'completed' or
 * 'expired' from stripe-webhook. 'started' rows older than a day are abandoned checkouts.
 */

type DbError = { message: string } | null

/** The slice of the supabase-js client these helpers use (a fake in tests). */
export interface CheckoutAttemptsDb {
  from(table: 'checkout_attempts'): {
    upsert(row: Record<string, unknown>, options: { onConflict: string }): PromiseLike<{ error: DbError }>
    update(patch: Record<string, unknown>): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          select(columns: string): PromiseLike<{ data: unknown[] | null; error: DbError }>
        }
      }
    }
  }
}

/** Best effort: never throws, so tracking can't block checkout. Returns whether it was written. */
export async function recordCheckoutStarted(db: CheckoutAttemptsDb, profileId: string, sessionId: string): Promise<boolean> {
  try {
    const { error } = await db
      .from('checkout_attempts')
      .upsert({ profile_id: profileId, stripe_checkout_session_id: sessionId, status: 'started' }, { onConflict: 'stripe_checkout_session_id' })
    if (!error) return true
    console.error('checkout_attempts: failed to record started', { sessionId, error: error.message })
  } catch (err) {
    console.error('checkout_attempts: failed to record started', { sessionId, error: err instanceof Error ? err.message : String(err) })
  }
  return false
}

/** Upsert, not update: a completion is recorded even if the 'started' write never happened.
 * Throws so the webhook returns 5xx and Stripe redelivers. */
export async function markCheckoutCompleted(db: CheckoutAttemptsDb, profileId: string, sessionId: string, now: Date): Promise<void> {
  const { error } = await db.from('checkout_attempts').upsert(
    { profile_id: profileId, stripe_checkout_session_id: sessionId, status: 'completed', completed_at: now.toISOString() },
    { onConflict: 'stripe_checkout_session_id' },
  )
  if (error) throw new Error(`checkout_attempts: mark completed: ${error.message}`)
}

/** Only 'started' -> 'expired' (a completed session can't expire). Returns rows changed;
 * 0 means no started row (never recorded, or already closed). Throws on a DB error. */
export async function markCheckoutExpired(db: CheckoutAttemptsDb, sessionId: string): Promise<number> {
  const { data, error } = await db
    .from('checkout_attempts')
    .update({ status: 'expired' })
    .eq('stripe_checkout_session_id', sessionId)
    .eq('status', 'started')
    .select('id')
  if (error) throw new Error(`checkout_attempts: mark expired: ${error.message}`)
  return data?.length ?? 0
}
