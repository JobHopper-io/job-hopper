## Database overview (Supabase)

- **Primary schema source**: `src/types/supabase.ts` (Supabase‑generated `Database` type, regenerated via `npm run db:types`).
- **Convenience type aliases**: `src/types/database.ts` provides shorter type names (`Profile`, `Organization`, etc.) and globally-used custom types (`AddonType`, `Addon`). This file imports from `supabase.ts` and is safe to edit (won't be overwritten when regenerating types).
- **This document** only captures high‑level entities, relationships, and business rules that are not obvious from raw types.
- For exact columns, types, and enums, always refer to `src/types/supabase.ts`. When writing code, prefer importing convenience aliases from `@/types/database`.

## Core entities

### organizations
- **Meaning**: The table is used only for **subscription and billing** (one row per subscription).
- **Key relationships**:
  - One row can have many `profiles` (via `profiles.organization_id`).
- **Non‑obvious rules**:
  - Subscription state is tracked via `subscription_status` and `subscription_tier` enums (see `Database["public"]["Enums"]` in `supabase.ts`).
  - Stripe‑related fields (`stripe_*`) and `trial_ends_at` coordinate billing and trial periods; app logic should keep these consistent.

### profiles
- **Meaning**: End-user profiles for the app; each profile is linked to a subscription (billing) row and uses job‑hopping features.
- **Key relationships**:
  - Many profiles can belong to a single subscription row (`profiles.organization_id` → `organizations.id`; the column name is legacy).
- **Non‑obvious rules**:
  - Profile fields (e.g. `resume_bucket_key`, preferences, target roles) should be treated as part of a single logical profile object when updating to avoid partial, inconsistent saves.

### job and lead data (job_hopper_live, raw_jobs, bd_leads, exclusion_lists, enriched_lead)
- **Meaning**: Various tables representing job postings, lead enrichment, and exclusions for outreach/processing pipelines.
- **Key relationships**:
  - These tables currently have no explicit foreign‑key links to `profiles` or `organizations` in the generated types; linkages are done via shared fields (e.g. company name, job metadata) or app‑level logic.
- **Non‑obvious rules**:
  - `bd_leads.status` uses the `bd_leads_status` enum for the internal processing pipeline (see enum values in `supabase.ts`).
  - `exclusion_lists` rows should be treated as “do not contact”/“do not process” markers when matching jobs or companies for outbound flows.
  - `enriched_lead` and `raw_jobs` often contain semi‑structured JSON metadata (`apollo_metadata`, `icypeas_meta_data`, `"apollo data"`, `"Meta Data"`); downstream logic should treat these as opaque blobs unless there is explicit parsing logic.

