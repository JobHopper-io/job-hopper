import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

/**
 * Server-side mirror of the frontend `baseTier` (src/stores/user.ts):
 *   - 'free'    — no active/trial subscription, or no base-plan product on it
 *   - 'premium' — active/trial subscription whose base plan product.key === 'premium'
 *   - 'core'    — active/trial subscription with any other base plan
 *
 * Also folds in an admin-granted trial seat (see trial_grants /
 * profiles.trial_grant_id, Build 09) as a second input: the effective tier is
 * whichever of (real subscription tier, active trial grant tier) ranks higher, so a
 * trial never downgrades a paying user and a real subscription never lapses just
 * because a linked trial grant expired.
 *
 * Requires a service-role client (reads subscriptions + subscription_product +
 * products, plus profiles + trial_grants for the trial-seat check).
 */
export type BaseTier = 'free' | 'core' | 'premium'

const TIER_RANK: Record<BaseTier, number> = { free: 0, core: 1, premium: 2 }

function higherTier(a: BaseTier, b: BaseTier): BaseTier {
  return TIER_RANK[b] > TIER_RANK[a] ? b : a
}

async function resolveTrialTier(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<BaseTier> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('trial_grant_id')
    .eq('id', profileId)
    .maybeSingle()

  if (!profile?.trial_grant_id) return 'free'

  const { data: grant } = await supabaseAdmin
    .from('trial_grants')
    .select('feature_tier, status, expires_at')
    .eq('id', profile.trial_grant_id)
    .maybeSingle()

  if (!grant) return 'free'
  if (grant.status !== 'active') return 'free'
  if (new Date(grant.expires_at).getTime() <= Date.now()) return 'free'

  return grant.feature_tier === 'premium' || grant.feature_tier === 'core' ? grant.feature_tier : 'free'
}

export async function resolveBaseTier(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<BaseTier> {
  let subscriptionTier: BaseTier = 'free'

  const { data: subs, error: subsError } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('profile_id', profileId)
    .in('status', ['trial', 'active'])

  if (!subsError && subs && subs.length > 0) {
    const subIds = subs.map((s) => s.id)

    const { data: subProducts, error: subProdError } = await supabaseAdmin
      .from('subscription_product')
      .select('product_id')
      .in('subscription_id', subIds)

    if (!subProdError && subProducts && subProducts.length > 0) {
      const productIds = Array.from(new Set(subProducts.map((sp) => sp.product_id)))

      const { data: products, error: productsError } = await supabaseAdmin
        .from('products')
        .select('key, category')
        .in('id', productIds)
        .eq('category', 'base_plan')

      if (!productsError && products && products.length > 0) {
        subscriptionTier = products.some((p) => p.key === 'premium') ? 'premium' : 'core'
      }
    }
  }

  const trialTier = await resolveTrialTier(supabaseAdmin, profileId)

  return higherTier(subscriptionTier, trialTier)
}
