## Architecture Decisions

### Function scheduling (scheduled_jobs)

A table-driven scheduler runs edge functions at approximately a given time. Use it only for **system/cron-style** edge functions (no user JWT).

- **Table**: `public.scheduled_jobs` — columns include `function_name`, `payload` (jsonb), `run_at`, `status`, `error_message`, `started_at`, `finished_at`. See `docs/db-schema-summary.md`.
- **Scheduler**: Edge function `run-scheduled-jobs`. Invoked every 15 minutes by pg_cron + pg_net. It (1) marks stale `running` jobs as `failed`, (2) selects pending jobs with `run_at <= now()` up to a limit (e.g. 25), (3) for each job sets `running`/`started_at`, POSTs to `SUPABASE_URL/functions/v1/{function_name}` with the payload (60s timeout), then sets `completed` or `failed` with `error_message` and `finished_at`.
- **Cron**: The scheduler must be manually created. It should POST to 'match-profile-jobs' edge function every 15 minutes. Be sure to add the suth header with secret key.
- **How to use**: From backend-only code (e.g. an edge function with service_role), insert into `scheduled_jobs` with `function_name` (target edge function name), `payload`, and `run_at`. Only schedule functions that accept service-role calls (no user context). Do not expose insert to the client unless you add a restricted RLS policy.

### Supabase client

- `supabase` (from `src/lib/supabase.ts`) is **only** used in API helpers under `src/lib/`
- **Views, stores, and composables never import `supabase` directly**. They call the API API helpers under `src/lib/` instead.

### Database (schema & types)

- For database schema, types, see docs: `docs/db-schema-summary.md`.
- For how AI should use them, see Cursor rule: `.cursor/rules/db-schema.mdc`.
- **User-editable subsets**: When an API or form should only allow updating a subset of columns (e.g. to avoid letting callers change `role`, `organization_id`, or other sensitive fields), define a narrowed type in `src/types/database.ts`—e.g. `ProfileUserEditable` as `Pick<ProfileUpdate, ...>`—and use that for the public API. This keeps the allowed-field set in one place and documents the boundary next to the other profile types.

### Email notifications

Edge functions send transactional emails (job match digests, subscription updates, system announcements) via a provider-agnostic `sendEmail` helper in `supabase/functions/_shared/`, backed by Mailtrap’s Email Sending HTTP API.

- **Provider implementation**: `supabase/functions/_shared/email-provider.ts` calls Mailtrap’s `POST /api/send` endpoint on `https://send.api.mailtrap.io` with an API token (`MAILTRAP_API_TOKEN`) and maps responses into `email_events`.
- **Configuration (Edge Function secrets)**:
  - `MAILTRAP_API_TOKEN`: Mailtrap Email Sending API token.
  - `MAILTRAP_BASE_URL` (optional): defaults to `https://send.api.mailtrap.io`.
  - `MAILTRAP_FROM` (optional): default `From` address, e.g. `"Job-Hopper" <no-reply@example.com>`. If omitted, falls back to `Job-Hopper <no-reply@mailtrap.io>`.
  - `UNSUBSCRIBE_EMAIL_SECRET`: HMAC secret used to sign one‑click unsubscribe tokens.
  - `SITE_URL`: Base URL for links in emails (e.g. `https://app.job-hopper.com`), used for profile/preferences and dashboard links.
- **Fallback behavior**:
  - If `MAILTRAP_API_TOKEN` is missing, `sendEmail` returns `success: false` with a clear error message and logs to the function console; core flows (job matching, Stripe webhooks, announcements) still complete, but no email is sent.
  - Non‑2xx responses from Mailtrap are logged (status + truncated body) and recorded in `email_events` with `status = 'failed'`.

All unsubscribe links use a signed token (see `supabase/functions/_shared/unsubscribe-token.ts` and `supabase/functions/unsubscribe-email`) and respect `notification_settings.email_unsubscribed_at`, so users can one‑click unsubscribe from all emails while still managing granular preferences from the profile screen.