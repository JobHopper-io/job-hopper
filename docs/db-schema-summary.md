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
- **Meaning**: Catalog of products used for display, pricing, and gating. The catalog is **DB-only**; Supabase products are the source of truth, and each product may have a canonical Stripe Product referenced by `stripe_product_id`. Stripe products/prices are created as a projection of this table and are looked up by `stripe_product_id`.
- **Columns**: `id`, `key`, `display_name`, `description` (text), `price_cents` (integer), `category` (enum `product_category`), `stripe_product_id` (text, nullable), `available_for_purchase` (boolean, default `true`).
- **Key relationships**:
  - Referenced by `subscription_product` (products on a subscription) and `resume_products` (resume upgrade and per-job resume advice purchases).
- **Non‑obvious rules**:
  - `category = 'base_plan'` for recurring base subscription plans.
  - `category = 'subscription_addon'` for recurring add-ons attached to a subscription (billed monthly alongside the base plan).
  - `category = 'one_time_addon'` for one-time purchase add-ons that complement a subscription/profile (e.g. resume upgrade).
  - `category = 'one_time_item'` for one-time purchase products that are not conceptually part of a subscription bundle (e.g. per-job resume advice, bought from a job match with `job_match_id` in checkout metadata).
  - For billing semantics, `base_plan` and `subscription_addon` map to recurring Stripe prices; `one_time_addon` and `one_time_item` map to one-time prices.
  - `stripe_product_id` is **derived** and used only as an operational mapping to Stripe. Supabase remains the source of truth for the catalog; Stripe is a projection/cache.
  - `available_for_purchase`: when `false`, the product is hidden from catalog UIs (`getBasePlanProducts` / `getAddonProducts` filter) and rejected by `create-checkout-session` and `modify-subscription` so it cannot be newly purchased; rows are retained for existing subscribers and Stripe ID mapping (e.g. retired subscription add-ons such as `premium_insights` / `interview_prep`).
  - Frontend derives tier (base plan) and addons from these rows; use `key`, `display_name`, `description`, and `price_cents` from the DB. Use `getBasePlanProducts()` and `subscriptionAPI.getAddonProducts()` for subscription bundle catalog; use `resumeProductsAPI.getResumeAdviceProduct()` for the per-job resume advice row (`one_time_item`). Checkout accepts our product ids; the create-checkout-session Edge Function loads products by id, ensures a canonical Stripe Product per Supabase product, and builds Stripe line items with `price_data.product = stripe_product_id`. The Stripe webhook maps subscription items and one-time lines back to Supabase products by joining on `products.stripe_product_id`.

### subscription_product
- **Meaning**: Join table: which products are on each subscription (one row per subscription × product).
- **Key relationships**:
  - `subscription_id` → `subscriptions.id`, `product_id` → `products.id`. UNIQUE(`subscription_id`, `product_id`).
- **Non‑obvious rules**:
  - Updated by webhook `customer.subscription.updated` to match Stripe subscription items exactly (add missing, remove extras).
  - Stores `stripe_subscription_item_id` for each `(subscription_id, product_id)` so Stripe subscription items can be updated or cancelled individually without treating Stripe as a source of truth.

### resume_products
- **Meaning**: Lifecycle records for resume-related one-time purchases: initial resume overhaul (`resume_upgrade`) and per-job resume advice (`per_job_resume_advice`). Each row represents a single purchase and its status through fulfillment.
- **Key relationships**:
  - `profile_id` → `profiles.id`, `product_id` → `products.id`, `job_match_id` → `job_matches.id` (nullable).
  - UNIQUE(`profile_id`, `job_match_id`, `product_id`): at most one per-job purchase per job per profile; resume upgrade uses `job_match_id` null.
- **Non‑obvious rules**:
  - Populated by webhook `checkout.session.completed` from one-time line items for products with `key IN ('resume_upgrade', 'per_job_resume_advice')`. For `per_job_resume_advice`, `job_match_id` is set from session metadata; for `resume_upgrade` it stays null.
  - `improvements_text` stores plain-text LLM output from n8n for **both** product types: the `stripe-webhook` function invokes `fulfillResumeProductViaN8n` (background) which calls the appropriate n8n URL, then updates the row with `improvements_text`, `status = 'complete'`, and `completed_at`.
  - `status` enum: `pending` | `complete` | `cancelled`; default `pending`. `completed_at` set when fulfillment completes.
  - Only service_role (e.g. edge functions) writes; authenticated users can SELECT their own rows via RLS.

## Job and lead data (job_hopper_live, raw_jobs, bd_leads, exclusion_lists, enriched_lead)
- **Meaning**: Various tables representing job postings, lead enrichment, and exclusions for outreach/processing pipelines.
- **Key relationships**:
  - These tables currently have no explicit foreign‑key links to `profiles` or `subscriptions` in the generated types; linkages are done via shared fields (e.g. company name, job metadata) or app‑level logic.
- **Non‑obvious rules**:
  - `bd_leads` rows consist of `id`, `created_at`, `company_name`, and `status`, with a unique constraint on `company_name`. `status` uses the `bd_leads_status` enum (see enum values in `supabase.ts`); default is `'Ready to Process'`.
  - `exclusion_lists` rows should be treated as “do not contact”/“do not process” markers when matching jobs or companies for outbound flows. Each row consists of `id`, `created_at`, and `company_name`, with a unique constraint on `company_name`.
  - `enriched_lead` and `raw_jobs` often contain semi‑structured JSON metadata (`apollo_metadata`, `icypeas_meta_data`, `"apollo data"`, `"Meta Data"`); downstream logic should treat these as opaque blobs unless there is explicit parsing logic.
  - `job_hopper_live.subscription_tier` references `products.key` (which base-plan bucket the posting belongs to). The job-matching algorithm only considers jobs whose tier equals at least one `products.key` for a `base_plan` row on the profile’s trial/active subscriptions.

### job_matches
- **Meaning**: Records which jobs have been matched to which profile over time; this is the primary source for the user-facing “Recent job matches” and Job Browsing UI.
- **Key relationships**:
  - `profile_id` → `profiles.id`
  - `job_id` → `job_hopper_live.id`
- **Non‑obvious rules**:
  - A `(profile_id, job_id)` pair appears at most once; the matching pipeline skips any job that has already been matched in the past, even across multiple scheduled runs.
  - Rows are written only by backend edge functions (service_role), not by the frontend. Authenticated users can read only rows for their own profile.

### saved_jobs
- **Meaning**: Explicit favorites/saved jobs for a profile; separate from `job_matches` so that a user can star or un-star matches without affecting matching history.
- **Key relationships**:
  - `profile_id` → `profiles.id`
  - `match_id` → `job_matches.id` (and therefore indirectly to `job_hopper_live.id` via `job_matches.job_id`)
- **Non‑obvious rules**:
  - Authenticated users can insert/delete rows only for their own profile (enforced via RLS).
  - The frontend typically joins `saved_jobs` → `job_matches` → `job_hopper_live` to show saved matches with full job details.

### notification_settings
- **Meaning**: One row per profile; controls email notification preferences and when the last job-match digest was sent.
- **Key relationships**: `profile_id` → `profiles.id` (unique).
- **Non‑obvious rules**:
  - Created on first read or when the user opens email preferences; edge functions may also insert a row when sending job-match emails so that `last_job_match_email_sent_at` can be updated.
  - When `email_unsubscribed_at` is set, no transactional or marketing emails are sent regardless of per-channel toggles.
  - `job_match_email_frequency`: `immediate` | `daily` | `weekly`; with the current daily matching cadence, immediate and daily both send on each run when there are new matches; weekly sends only if `last_job_match_email_sent_at` is older than 7 days.

### email_events
- **Meaning**: Log of every email send attempt (job match digest, subscription update, system announcement) for debugging and metrics.
- **Key relationships**: `profile_id` → `profiles.id` (nullable for system-wide sends).
- **Non‑obvious rules**: Written by edge functions via the shared `sendEmail` helper; status is `sent` or `failed`. Not exposed for direct client writes.

### system_announcements
- **Meaning**: Broadcast announcements sent to opted-in users via the `send-system-announcement` edge function.
- **Key columns**: `slug`, `title`, `email_subject`, `email_body_html`, `published_at`. When `published_at` is set, the announcement can be sent.
- **Non‑obvious rules**: Only published rows are sent; target audience is derived from `notification_settings` (system_announcements_email_enabled = true and email_unsubscribed_at is null).

## Function scheduling (scheduled_jobs)

- **Meaning**: Table of jobs to run at a given time. The `run-scheduled-jobs` edge function is invoked every 15 minutes by pg_cron + pg_net, selects pending rows (up to a limit), and HTTP-invokes the target edge function with the stored payload. Only system/cron-designed edge functions (no user JWT) should be scheduled.
- **Key columns**: `function_name` (edge function name), `payload` (jsonb, POST body), `run_at` (timestamptz), `status` (`pending` | `running` | `completed` | `failed`), `error_message` (set on failure), `started_at` / `finished_at` (for execution and stale-job recovery).
- **Non‑obvious rules**:
  - Only the scheduler (edge function using service_role) reads and updates this table. RLS has no policies for anon/authenticated; access is via service_role only.
  - Stale jobs (left `running` after a crash or timeout) are marked `failed` at the start of each scheduler run (e.g. `started_at` older than 20 minutes).
  - Insert rows from backend code (e.g. another edge function or a server process) with `status = 'pending'` and `run_at` set to the desired execution time.
