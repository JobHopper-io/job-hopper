# Create Checkout Session Function

This Supabase Edge Function creates a Stripe checkout session for subscription and add-on purchases.

## Environment Variables Required

- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `SITE_URL` - Your frontend URL (for redirects)

## Usage

Call this function from your frontend:

```typescript
const { data, error } = await supabase.functions.invoke('create-checkout-session', {
  body: {
    tier: 'entry_mid' | 'senior_management' | 'director_vp_c_level',
    addons: {
      premium_insights?: boolean,
      interview_prep?: boolean,
      resume_upgrade?: boolean
    },
    successUrl?: string,
    cancelUrl?: string
  }
})
```

The function returns a checkout session URL that you can redirect the user to.

