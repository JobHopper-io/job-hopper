# Stripe Webhook – Job Hopper (Nick Schepis)

**SOW:** [nick-schepis-job-matching-mvp-app-sow.md](../../business-documents/nick-schepis-job-matching-mvp-app-sow.md) – Phase 1 (Checkout, subscription management).

---

## Endpoint

- **URL:** e.g. `https://your-api.com/webhooks/stripe` or client’s backend. Do not expose Stripe secret in frontend.
- **Method:** POST. Stripe sends `Stripe-Signature`; verify with `STRIPE_WEBHOOK_SECRET`.

---

## Events to handle

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Session contains `customer_email` and `subscription` or `customer`. Create or update `job_hopper_subscribers`: set `stripe_customer_id`, `stripe_subscription_id`, `tier` from metadata or price lookup. |
| `customer.subscription.updated` | Update `job_hopper_subscribers.tier` and `stripe_subscription_id` if changed. |
| `customer.subscription.deleted` | Set `stripe_subscription_id` and optionally `tier` to null (or “cancelled”). |

---

## Products / prices (client to create in Stripe)

- **Tiers:** Operators $19/mo, Engineers $29/mo, Executive $49/mo (price IDs: e.g. price_xxx).
- **Add-ons:** Resume enrichment, Contact info (+$50). Store add-on state in subscriber record or a separate table if needed.

---

## Security

- Verify signature using `stripe.webhooks.constructEvent(payload, signature, webhookSecret)`.
- Return 200 quickly; process async if needed so Stripe does not retry unnecessarily.
