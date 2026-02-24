import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

type SupabaseProductRow = {
  id: string
  display_name: string
  stripe_product_id: string | null
}

export async function getStripeProductId(
  supabaseClient: SupabaseClient,
  product: SupabaseProductRow,
): Promise<string> {
  if (product.stripe_product_id) {
    return product.stripe_product_id
  }

  const stripeProduct = await stripe.products.create({
    name: product.display_name,
  })

  const { error } = await supabaseClient
    .from('products')
    .update({ stripe_product_id: stripeProduct.id })
    .eq('id', product.id)

  if (error) {
    console.error('Failed to update products.stripe_product_id', error)
  }

  return stripeProduct.id
}

