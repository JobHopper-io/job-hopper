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

Edge functions send transactional emails (job match digests, subscription updates, system announcements) via a provider-agnostic `sendEmail` helper in `supabase/functions/_shared/`. Out of the box, a **stub implementation** logs payloads and records rows in `email_events` without sending real email.

To enable real delivery, implement a real provider in `supabase/functions/_shared/email-provider.ts` (e.g. SMTP with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, or an HTTP API such as Resend with `RESEND_API_KEY`). Set **Edge Function secrets** in the Supabase dashboard (or via `supabase secrets set`). For one-click unsubscribe links, set `UNSUBSCRIBE_EMAIL_SECRET`; for site links in emails, set `SITE_URL`.