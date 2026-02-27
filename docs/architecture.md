## Architecture Decisions

### Function scheduling (scheduled_jobs)

A table-driven scheduler runs edge functions at approximately a given time. Use it only for **system/cron-style** edge functions (no user JWT).

- **Table**: `public.scheduled_jobs` — columns include `function_name`, `payload` (jsonb), `run_at`, `status`, `error_message`, `started_at`, `finished_at`. See `docs/db-schema-summary.md`.
- **Scheduler**: Edge function `run-scheduled-jobs` (verify_jwt = false, secured by `x-cron-secret`). Invoked every 15 minutes by pg_cron + pg_net. It (1) marks stale `running` jobs as `failed`, (2) selects pending jobs with `run_at <= now()` up to a limit (e.g. 25), (3) for each job sets `running`/`started_at`, POSTs to `SUPABASE_URL/functions/v1/{function_name}` with the payload (60s timeout), then sets `completed` or `failed` with `error_message` and `finished_at`.
- **Cron**: Migration `20260226100001_scheduled_jobs_cron.sql` schedules the scheduler. Requires Vault secrets `project_url` and `cron_secret` (same value as edge secret `CRON_SECRET`).
- **How to use**: From backend-only code (e.g. an edge function with service_role), insert into `scheduled_jobs` with `function_name` (target edge function name), `payload`, and `run_at`. Only schedule functions that accept service-role calls (no user context). Do not expose insert to the client unless you add a restricted RLS policy.

### Supabase client

- `supabase` (from `src/lib/supabase.ts`) is **only** used in API helpers under `src/lib/`
- **Views, stores, and composables never import `supabase` directly**. They call the API API helpers under `src/lib/` instead.

### Database (schema & types)

- For database schema, types, see docs: `docs/db-schema-summary.md`.
- For how AI should use them, see Cursor rule: `.cursor/rules/db-schema.mdc`.
- **User-editable subsets**: When an API or form should only allow updating a subset of columns (e.g. to avoid letting callers change `role`, `organization_id`, or other sensitive fields), define a narrowed type in `src/types/database.ts`—e.g. `ProfileUserEditable` as `Pick<ProfileUpdate, ...>`—and use that for the public API. This keeps the allowed-field set in one place and documents the boundary next to the other profile types.