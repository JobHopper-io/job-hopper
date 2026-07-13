import Stripe from 'npm:stripe@14.21.0'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

let supabaseAdmin: ReturnType<typeof createClient> | null = null
function getSupabaseAdmin(): ReturnType<typeof createClient> {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
  }
  return supabaseAdmin
}

type SupabaseProductRow = {
  id: string
  display_name: string
  stripe_product_id: string | null
}

/** Ensures a Stripe product exists for the Supabase product and persists stripe_product_id (uses service-role client; RLS only allows SELECT for anon/authenticated). */
export async function getStripeProductId(
  product: SupabaseProductRow,
): Promise<string> {
  if (product.stripe_product_id) {
    return product.stripe_product_id
  }

  const stripeProduct = await stripe.products.create({
    name: product.display_name,
  })

  const admin = getSupabaseAdmin()
  const { error } = await admin
    .from('products')
    .update({ stripe_product_id: stripeProduct.id })
    .eq('id', product.id)

  if (error) {
    console.error('Failed to update products.stripe_product_id', error)
    throw new Error(
      `Could not persist stripe_product_id for product ${product.id}: ${error.message}`,
    )
  }

  return stripeProduct.id
}

