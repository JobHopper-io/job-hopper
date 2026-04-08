# Create Checkout Session Function

This Supabase Edge Function creates a Stripe checkout session for subscription and add-on purchases.

## Environment Variables Required

- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `SITE_URL` - Your frontend URL (for redirects)

## Usage

Call this function from your frontend with Supabase product UUIDs (from the `products` table):

```typescript
const { data, error } = await supabase.functions.invoke('create-checkout-session', {
  body: {
    productIds: string[],
    successUrl?: string,
    cancelUrl?: string,
    trialEnd?: number,
    jobMatchId?: string,
  },
})
```

`jobMatchId` is optional and used only when purchasing per-job resume tailoring (`resume_tailoring`), so the webhook can attach `resume_products.job_match_id`.

Products with `available_for_purchase = false` in the database are rejected.

The function returns a checkout session URL that you can redirect the user to.

