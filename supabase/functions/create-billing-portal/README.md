# Create Billing Portal Function

This Supabase Edge Function creates a Stripe billing portal session, allowing customers to:
- Update payment methods
- View billing history and invoices
- Update billing address
- Cancel or modify subscriptions
- Manage add-ons

## Environment Variables Required

- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `SITE_URL` - Your frontend URL (for return redirect)

## Usage

Call this function from your frontend:

```typescript
const { data, error } = await supabase.functions.invoke('create-billing-portal', {
  body: {
    returnUrl: 'https://your-site.com/billing' // Optional, defaults to SITE_URL/billing
  }
})
```

The function returns a billing portal URL that you can redirect the user to.

## Stripe Setup

Make sure you have configured the billing portal in your Stripe Dashboard:
1. Go to Settings > Billing > Customer portal
2. Configure which features customers can access
3. Customize the portal appearance

