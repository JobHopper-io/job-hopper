# Stripe Webhook Function

This Supabase Edge Function handles Stripe webhook events to keep subscription status in sync.

## Environment Variables Required

- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook signing secret
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (for admin operations)

## Webhook Events Handled

- `checkout.session.completed` - Updates subscription when checkout completes
- `customer.subscription.updated` - Updates subscription details
- `customer.subscription.deleted` - Marks subscription as cancelled
- `invoice.payment_succeeded` - Updates subscription to active
- `invoice.payment_failed` - Marks subscription as past_due

## Setup

1. Deploy the function:
```bash
supabase functions deploy stripe-webhook
```

2. Get the function URL from Supabase dashboard

3. Add webhook endpoint in Stripe Dashboard:
   - URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
   - Events to listen for:
     - checkout.session.completed
     - customer.subscription.updated
     - customer.subscription.deleted
     - invoice.payment_succeeded
     - invoice.payment_failed

4. Copy the webhook signing secret and add it as `STRIPE_WEBHOOK_SECRET` environment variable

