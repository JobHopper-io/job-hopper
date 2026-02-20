## Database overview (Supabase)

- **Primary schema source**: `src/types/supabase.ts` (Supabase‑generated `Database` type). Regenerate after schema changes with `npm run db:types` (requires `--linked`, `--local`, `--project-id`, or `--db-url`; e.g. `npx supabase gen types typescript --schema public --linked > src/types/supabase.ts`).
- **Convenience type aliases**: `src/types/database.ts` provides shorter type names (`Profile`, `CurrentSubscription`, `Product`, etc.) and globally-used custom types (`AddonType`, `Addon`). This file imports from `supabase.ts` where applicable and is safe to edit (won't be overwritten when regenerating types).
- **This document** only captures high‑level entities, relationships, and business rules that are not obvious from raw types.
- For exact columns, types, and enums, always refer to `src/types/supabase.ts`. When writing code, prefer importing convenience aliases from `@/types/database`.

## Core entities

### profiles
- **Meaning**: End-user profiles for the app; each profile may have a Stripe customer and uses job‑hopping features.
- **Key relationships**:
  - Each profile has at most one `stripe_customer_id` (set when the user completes checkout or is created by the checkout flow).
  - **Subscription relationship is reversed**: `subscription` rows reference `profile_id`; there is no `profiles.subscription_id`. The “current” subscription for a profile is the row in `subscription` where `profile_id` = profile and `subscription_status IN ('trial','active')`, typically the latest by `current_period_ends_at`.
- **Non‑obvious rules**:
  - Profile fields (e.g. `resume_bucket_key`, preferences, target roles) should be treated as part of a single logical profile object when updating to avoid partial, inconsistent saves.
  - Phone number is stored on profiles and must be unique (normalized to digits for comparison).
  - `onboarding_completed` is set by the Stripe webhook when `checkout.session.completed` is received for that profile.

### subscription (singular)
- **Meaning**: One row per Stripe subscription; Stripe is the source of truth. Subscription and product data are written only by the `stripe-webhook` Edge Function.
- **Key relationships**:
  - `profile_id` → `profiles.id` (each subscription belongs to one profile).
  - Subscription items (recurring products) are stored in `subscription_product` (subscription_id + product_id → `products`).
- **Non‑obvious rules**:
  - `subscription_status` uses enum `billing_subscription_status`: `trial` | `active` | `canceled`. Map Stripe `trialing` → `trial`, `active`/`past_due` → `active`, `canceled`/`unpaid`/`expired` → `canceled`.
  - “Current” subscription = row with `subscription_status IN ('trial','active')`; if multiple exist, use latest by `current_period_ends_at`.
  - Rows are not deleted when Stripe cancels; status is set to `canceled` for history.

### products
- **Meaning**: Catalog of Stripe products used for display and gating; keyed by `stripe_product_id`.
- **Key relationships**:
  - Referenced by `subscription_product` (products on a subscription) and `profile_product` (one-time purchases attached to a profile).
- **Non‑obvious rules**:
  - `is_addon = false` for base plan products; `is_addon = true` for addons and one-time products.
  - Frontend derives tier (base plan) and addons from these rows; use `key` and `display_name` from the DB, do not hardcode product keys or labels in the UI.

### subscription_product
- **Meaning**: Join table: which products are on each subscription (one row per subscription × product).
- **Key relationships**:
  - `subscription_id` → `subscription.id`, `product_id` → `products.id`. UNIQUE(`subscription_id`, `product_id`).
- **Non‑obvious rules**:
  - Updated by webhook `customer.subscription.updated` to match Stripe subscription items exactly (add missing, remove extras).

### profile_product
- **Meaning**: One-time product purchases attached to a profile (e.g. resume upgrade).
- **Key relationships**:
  - `profile_id` → `profiles.id`, `product_id` → `products.id`. UNIQUE(`profile_id`, `product_id`).
- **Non‑obvious rules**:
  - Populated by webhook `checkout.session.completed` from one-time line items in the session.

## Deprecated / removed
- **Old `subscriptions` table**: Dropped; replaced by `subscription` (singular) with `profile_id` and product-based tier/addons.
- **`profiles.subscription_id`**: Dropped.
- **RPCs**: `create_subscription_for_user`, `update_subscription_tier`, `enable_premium_addon` have been removed. Checkout is the only way to create or change subscription state; the webhook writes to `subscription`, `subscription_product`, and `profile_product`.

## Job and lead data (job_hopper_live, raw_jobs, bd_leads, exclusion_lists, enriched_lead)
- **Meaning**: Various tables representing job postings, lead enrichment, and exclusions for outreach/processing pipelines.
- **Key relationships**:
  - These tables currently have no explicit foreign‑key links to `profiles` or `subscription` in the generated types; linkages are done via shared fields (e.g. company name, job metadata) or app‑level logic.
- **Non‑obvious rules**:
  - `bd_leads.status` uses the `bd_leads_status` enum for the internal processing pipeline (see enum values in `supabase.ts`).
  - `exclusion_lists` rows should be treated as “do not contact”/“do not process” markers when matching jobs or companies for outbound flows.
  - `enriched_lead` and `raw_jobs` often contain semi‑structured JSON metadata (`apollo_metadata`, `icypeas_meta_data`, `"apollo data"`, `"Meta Data"`); downstream logic should treat these as opaque blobs unless there is explicit parsing logic.
