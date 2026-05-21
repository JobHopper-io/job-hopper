import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

/**
 * Product `key` values (see `products.key`) for base_plan products on the profile's
 * active (trial or active) subscriptions. Used to align job matching with `job_hopper_live.subscription_tier`.
 */
export async function getSubscriptionTierProductKeysForProfile(
  client: SupabaseClient,
  profileId: string,
): Promise<string[]> {
  const { data: subs, error: subsError } = await client
    .from('subscriptions')
    .select('id')
    .eq('profile_id', profileId)
    .in('status', ['trial', 'active'])

  if (subsError || !subs?.length) {
    return []
  }

  const subIds = subs.map((s) => s.id)
  const { data: subProducts, error: spError } = await client
    .from('subscription_product')
    .select('product_id')
    .in('subscription_id', subIds)

  if (spError || !subProducts?.length) {
    return []
  }

  const productIds = [...new Set(subProducts.map((sp) => sp.product_id))]
  const { data: baseProducts, error: pError } = await client
    .from('products')
    .select('key')
    .in('id', productIds)
    .eq('category', 'base_plan')

  if (pError || !baseProducts?.length) {
    return []
  }

  return [...new Set(baseProducts.map((p) => p.key).filter((k): k is string => typeof k === 'string' && k.length > 0))]
}

/** User-facing error when matching cannot load jobs without tier keys. */
export function subscriptionTierKeysRequiredMessage(): string {
  return (
    'No subscription tier product keys are available. The profile has no trial/active base plan ' +
    'subscription (or none were resolved), and the tier keys override field is empty. ' +
    'Enter comma-separated products.key values that match job_hopper_live.subscription_tier, ' +
    'or test as a profile with an active base plan subscription.'
  )
}

export function assertSubscriptionTierKeysForMatching(keys: readonly string[]): void {
  if (keys.length === 0) {
    throw new Error(subscriptionTierKeysRequiredMessage())
  }
}
