# Job Hopper – Backend API Spec (Nick Schepis)

**SOW:** [nick-schepis-job-matching-mvp-app-sow.md](../../business-documents/nick-schepis-job-matching-mvp-app-sow.md) – Phase 3. Use same Supabase project as scraping; RLS so users see only their own data.

---

## Auth

- **Supabase Auth:** JWT from `supabase.auth.getSession()`. Pass `Authorization: Bearer <access_token>` on API requests. For direct Supabase client from the app, use RLS policies that restrict by `auth.uid()` when subscriber is linked to auth (e.g. `job_hopper_subscribers.auth_user_id`). If subscribers are email-only initially, use a service role or API key for server-side “matched jobs” endpoint until auth is tied to subscriber.
- **Optional:** Link `job_hopper_subscribers` to `auth.users`: add `auth_user_id` UUID FK; set on first login so RLS can use `auth.uid() = auth_user_id`.

---

## Endpoints (REST)

| Method | Path | Description |
|--------|------|-------------|
| GET | /profile | Current subscriber and preferences (from JWT or session). |
| PUT | /profile | Update preferences (roles, pay range, location, relocation). |
| GET | /jobs/matched | List matched jobs for current subscriber (uses [matching-rules-job-hopper.md](./matching-rules-job-hopper.md), same as 24h batch). |
| GET | /jobs/:id | Single job with AI briefing (cached by job id). |
| GET | /subscription | Subscription status (tier, stripe_subscription_id). |
| POST | /notifications/preferences | Notification preferences (email on/off, etc.). |

---

## Data source

- **Jobs:** Read from `job_hopper_jobs` (and optional `company_enrichment` for briefings). Do not read from or modify the client’s BD n8n workflow or `bd_workflow_jobs` for Job Hopper app.

---

## Implementation options

- **Supabase + RLS:** App calls Supabase directly for profile and preferences; “matched jobs” can be a Edge Function that runs matching and returns job list (or a view/materialized view refreshed periodically).
- **Separate API server:** Node/Express or similar that uses Supabase service role, implements GET /jobs/matched (run matching module), GET /jobs/:id (with briefing). Document base URL and auth for the PWA / web app.
