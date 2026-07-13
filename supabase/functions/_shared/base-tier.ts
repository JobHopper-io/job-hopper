import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

/**
 * Server-side mirror of the frontend `baseTier` (src/stores/user.ts):
 *   - 'free'    — no active/trial subscription, or no base-plan product on it
 *   - 'premium' — active/trial subscription whose base plan product.key === 'premium'
 *   - 'core'    — active/trial subscription with any other base plan
 *
 * Requires a service-role client (reads subscriptions + subscription_product + products).
 */
export type BaseTier = 'free' | 'core' | 'premium'

export async function resolveBaseTier(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<BaseTier> {
  const { data: subs, error: subsError } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('profile_id', profileId)
    .in('status', ['trial', 'active'])

  if (subsError || !subs || subs.length === 0) return 'free'

  const subIds = subs.map((s) => s.id)

  const { data: subProducts, error: subProdError } = await supabaseAdmin
    .from('subscription_product')
    .select('product_id')
    .in('subscription_id', subIds)

  if (subProdError || !subProducts || subProducts.length === 0) return 'free'

  const productIds = Array.from(new Set(subProducts.map((sp) => sp.product_id)))

  const { data: products, error: productsError } = await supabaseAdmin
    .from('products')
    .select('key, category')
    .in('id', productIds)
    .eq('category', 'base_plan')

  if (productsError || !products || products.length === 0) return 'free'

  if (products.some((p) => p.key === 'premium')) return 'premium'
  return 'core'
}
