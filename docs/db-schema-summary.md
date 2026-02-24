## Database overview (Supabase)

- **Primary schema source**: `src/types/supabase.ts` (Supabase‑generated `Database` type, regenerated via `npm run db:types`).
- **Convenience type aliases**: `src/types/database.ts` provides shorter type names (`Profile`, `Subscription`, `Product`, etc.) and globally-used custom types (`AddonType`, `Addon`). This file imports from `supabase.ts` where applicable and is safe to edit (won't be overwritten when regenerating types).
- **This document** only captures high‑level entities, relationships, and business rules that are not obvious from raw types.
- For exact columns, types, and enums, always refer to `src/types/supabase.ts`. When writing code, prefer importing convenience aliases from `@/types/database`.

## Core entities

### profiles
- **Meaning**: End-user profiles for the app; each profile may have a Stripe customer and uses job‑hopping features.
- **Key relationships**:
  - Each profile has at most one `stripe_customer_id` (set when the user completes checkout or is created by the checkout flow).
  - `subscriptions` rows reference `profile_id`; there is no `profiles.subscription_id`. A profile can have **multiple active subscriptions**: all such rows are considered active; the app uses every active subscription when deriving products, tier, and addons.
- **Non‑obvious rules**:
  - Profile fields (e.g. `resume_bucket_key`, preferences, target roles) should be treated as part of a single logical profile object when updating to avoid partial, inconsistent saves.
  - Phone number is stored on profiles and must be unique (normalized to digits for comparison).
  - `onboarding_completed` is set by the Stripe webhook when `checkout.session.completed` is received for that profile.

### subscriptions
- **Meaning**: One row per Stripe subscription; Stripe is the source of truth. Subscription and product data are written only by the `stripe-webhook` Edge Function.
- **Key relationships**:
  - Each subscription belongs to one profile
  - Subscription items (recurring products) are stored in `subscription_product` (subscription_id + product_id → `products`).
- **Non‑obvious rules**:
  - `status` uses enum `subscription_status`: `trial` | `active` | `canceled`. Map Stripe `trialing` → `trial`, `active`/`past_due` → `active`, `canceled`/`unpaid`/`expired` → `canceled`.
  - **Active subscriptions**: any row with `status IN ('trial','active')` is active. A profile can have multiple active subscriptions; the app does not choose a single “current” one—it considers all active rows when deriving products and entitlements.
  - Rows are not deleted when Stripe cancels; status is set to `canceled` for history.

### products
- **Meaning**: Catalog of products used for display, pricing, and gating. The catalog is **DB-only**; there is no `stripe_product_id`. Stripe products/prices are created on the fly at checkout via `price_data` and `product_data`; the webhook resolves products only from session/line-item metadata `supabase_product_id` (our product id).
- **Columns**: `id`, `key`, `display_name`, `description` (text), `is_addon`, `price_cents` (integer), `type` (enum `product_type`: `subscription` | `payment`), `stripe_product_id` (text, nullable).
- **Key relationships**:
  - Referenced by `subscription_product` (products on a subscription) and `profile_product` (one-time purchases attached to a profile).
- **Non‑obvious rules**:
  - `is_addon = false` for base plan products; `is_addon = true` for addons and one-time products.
  - `type = 'subscription'` for recurring products; `type = 'payment'` for one-time (e.g. resume upgrade).
  - `stripe_product_id` is **derived** and used only as an operational mapping to Stripe. Supabase remains the source of truth for the catalog; Stripe is a projection/cache.
  - Frontend derives tier (base plan) and addons from these rows; use `key`, `display_name`, `description`, and `price_cents` from the DB. Use `getBasePlanProducts()` and `subscriptionAPI.getAddonProducts()` to list products for the UI. Checkout accepts our product ids; the create-checkout-session Edge Function loads products by id, ensures a canonical Stripe Product per Supabase product, and builds Stripe line items with `price_data.product = stripe_product_id`. The Stripe webhook maps subscription items and one-time lines back to Supabase products by joining on `products.stripe_product_id`.

### subscription_product
- **Meaning**: Join table: which products are on each subscription (one row per subscription × product).
- **Key relationships**:
  - `subscription_id` → `subscriptions.id`, `product_id` → `products.id`. UNIQUE(`subscription_id`, `product_id`).
- **Non‑obvious rules**:
  - Updated by webhook `customer.subscription.updated` to match Stripe subscription items exactly (add missing, remove extras).
  - Stores `stripe_subscription_item_id` for each `(subscription_id, product_id)` so Stripe subscription items can be updated or cancelled individually without treating Stripe as a source of truth.

### profile_product
- **Meaning**: One-time product purchases attached to a profile (e.g. resume upgrade).
- **Key relationships**:
  - `profile_id` → `profiles.id`, `product_id` → `products.id`. UNIQUE(`profile_id`, `product_id`).
- **Non‑obvious rules**:
  - Populated by webhook `checkout.session.completed` from one-time line items in the session.

## Job and lead data (job_hopper_live, raw_jobs, bd_leads, exclusion_lists, enriched_lead)
- **Meaning**: Various tables representing job postings, lead enrichment, and exclusions for outreach/processing pipelines.
- **Key relationships**:
  - These tables currently have no explicit foreign‑key links to `profiles` or `subscriptions` in the generated types; linkages are done via shared fields (e.g. company name, job metadata) or app‑level logic.
- **Non‑obvious rules**:
  - `bd_leads.status` uses the `bd_leads_status` enum for the internal processing pipeline (see enum values in `supabase.ts`).
  - `exclusion_lists` rows should be treated as “do not contact”/“do not process” markers when matching jobs or companies for outbound flows.
  - `enriched_lead` and `raw_jobs` often contain semi‑structured JSON metadata (`apollo_metadata`, `icypeas_meta_data`, `"apollo data"`, `"Meta Data"`); downstream logic should treat these as opaque blobs unless there is explicit parsing logic.
