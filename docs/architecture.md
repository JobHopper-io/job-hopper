## Architecture Decisions

### Function scheduling (scheduled_jobs)

A table-driven scheduler runs edge functions at approximately a given time. Use it only for **system/cron-style** edge functions (no user JWT).

- **Table**: `public.scheduled_jobs` — columns include `function_name`, `payload` (jsonb), `run_at`, `status`, `error_message`, `started_at`, `finished_at`. See `docs/db-schema-summary.md`.
- **Scheduler**: Edge function `run-scheduled-jobs`. Invoked every 15 minutes by pg_cron + pg_net. It (1) marks stale `running` jobs as `failed`, (2) selects pending jobs with `run_at <= now()` up to a limit (e.g. 25), (3) for each job sets `running`/`started_at`, POSTs to `SUPABASE_URL/functions/v1/{function_name}` with the payload (60s timeout), then sets `completed` or `failed` with `error_message` and `finished_at`.
- **Cron**: The scheduler must be manually created. It should POST to 'match-jobs' edge function every 15 minutes. Be sure to add the suth header with secret key.
- **How to use**: From backend-only code (e.g. an edge function with service_role), insert into `scheduled_jobs` with `function_name` (target edge function name), `payload`, and `run_at`. Only schedule functions that accept service-role calls (no user context). Do not expose insert to the client unless you add a restricted RLS policy.

### Incident: run-scheduled-jobs cron silently dead for 6 days (2026-07-14 to 2026-07-20)

**Root cause:** the pg_cron job driving `run-scheduled-jobs` (`cron.job` jobid 5) had its
`Authorization: Bearer <token>` header hardcoded as a **literal legacy-format service-role JWT**
directly in the job's `command` SQL, set once at creation time instead of looked up dynamically.
That literal went stale against a platform-side service-role key rotation/reformat — same class
of key-format drift already seen with `sponsor-watch-check` (D51–55). Every 15-minute invocation
got a clean `401` from `isAuthorized()` and returned **before ever touching `scheduled_jobs`**,
so nothing was ever written to `error_message` anywhere — a stale credential compared as false
and the caller silently gave up, producing no error trail at all. This is the same pattern
`docs/sponsorship-data-engine.md`'s working-principle section documents repeatedly (silent
failure, plausible-looking exit code 0); see that section rather than re-deriving it here.
pg_cron itself never stopped — `cron.job_run_details` showed an unbroken record of the HTTP call
being dispatched successfully every single time; only the receiving end was rejecting it.

**Blast radius:** ~6 days. Both `daily-job-matching` and `reconcile-subscriptions` (unrelated
consumers of the same `scheduled_jobs` table) froze simultaneously at their `2026-07-14` pending
rows and never advanced — confirming the fault was in the shared poller, not either function's
own logic.

**Real impact found:** of 6 real (non-test) Stripe-backed subscriptions checked, exactly one had
genuinely drifted — `subaina@binarynext.io`'s subscription was `past_due` in Stripe but still
read `active` in our DB for the outage window. Corrected the moment the backlogged
`reconcile-subscriptions` run finally executed. Verified end-to-end, not just the DB write:
`subscriptionAPI.getProfileSubscriptionData()` (`src/lib/subscription.ts:217`) filters
`.in('status', ['trial', 'active'])` at query time, so the now-`past_due` row simply isn't
returned — `hasActiveSubscription` → `false` → `baseTier` → `'free'`. No entitlement leaked.
The other 5 real subscriptions checked out unchanged; no other drift found.

**Fix:** repointed jobid 5 to the same dynamic-secret pattern `reset-apollo-limits-monthly`
(jobid 15) already used successfully — `(select decrypted_secret from vault.decrypted_secrets
where name = 'cron_secret')` looked up fresh at execution time, sent as `x-cron-secret`, instead
of a hardcoded literal — via `cron.alter_job`. Verified: the manual drain call succeeded, both
backlogged rows completed, and both self-rescheduled their next run normally.

**Cron job inventory (checked while investigating, not just this one):** this project has
exactly two pg_cron jobs (`select * from cron.job`, unfiltered — exhaustive as of 2026-07-20):
jobid 5 (`run-scheduled-jobs`, just fixed above) and jobid 15 (`reset-apollo-limits-monthly`,
already used the vault lookup, was never affected). **As of this fix, neither remaining cron job
hardcodes a literal secret.** Worth re-checking this specifically whenever a new cron job is
added — the vault-lookup pattern isn't enforced anywhere, it's just now the case that both
existing jobs happen to follow it.

**Open question, not building now:** there is currently **zero alerting** on these
self-perpetuating `scheduled_jobs` chains going silent. This one sat completely dead for 6 days
with no error trail and was only caught incidentally while investigating an unrelated dashboard
staleness question — it could just as easily still be broken today otherwise. Worth a
monitoring/alerting layer (e.g. paging if `daily-job-matching` or `reconcile-subscriptions`
haven't completed within some expected window) — flagging for Nick/Syed to prioritize, out of
scope for today.

### Job match staleness (known gap, unfixed)

The 45-day recency gate (`recency.maxAgeDays` in `_shared/job-matching-algorithm.ts`,
`jobExceedsMaxAge`) only runs at **match-creation time**, inside `match-jobs`. Once a
`job_matches` row exists, nothing ever re-checks or removes it — `match-jobs` only selects
existing matches (to avoid re-inserting duplicates) and inserts new ones; it never deletes.

Both frontend read paths apply **zero age filter at read time**:
- `jobsAPI.getJobMatches()` (`src/lib/jobs.ts:235`, backs the Dashboard "Recent job matches"
  feed) — orders by `created_at desc`, no date condition.
- `jobsAPI.getJobMatchByJobId()` (`src/lib/jobs.ts:388`, backs `/job/:id`, saved jobs, and the
  application tracker) — pulls `job_hopper_live` by id, no date condition.

Net effect: a job matched when 5 days old can sit in a user's dashboard, saved jobs, or tracker
indefinitely, rendering identically to a fresh match regardless of how old the underlying
posting actually is now. This is a general data-hygiene/UX gap affecting all users on every
tier — not tied to any Premium feature. (Surfaced while investigating Ghost Listing Detector;
see `docs/sponsorship-data-engine.md` §0 for that separate, closed investigation.)

**Fixed 2026-07-20** — `toMatchedJob()` (`src/lib/jobs.ts`) now computes `isStale`/
`daysSincePosted` via the same `jobExceedsMaxAge` check, reused from
`_shared/job-matching-algorithm.ts` rather than reimplemented, at read time. Both `getJobMatches()`
and `getJobMatchByJobId()` route through it, so both surfaces are covered by one change.
Deliberately **never hides anything** — saved jobs, tracked applications, and regular matches all
just render an additional note ("Posted N days ago — may no longer be accepting applications")
on `JobCard.vue`/`JobDetail.vue` when stale. The 45-day threshold used is `defaultConfig`'s, not
any live admin override from `matching_algorithm_config` — a deliberate scope call to keep this
a cheap read-time note rather than an extra config fetch on every job-list load; if an admin
tunes the real gate away from 45 days, this note's threshold won't follow it.

### Application Tracker: near-zero adoption (found 2026-07-20, unrelated to Apply Intelligence)

While scoping Apply Intelligence's "outcome-rate" candidate (see
`docs/sponsorship-data-engine.md` §0), checked real usage of the Application Tracker feature
(`job_applications`, shipped alongside the Saved/Applied/Interviewing/Rejected/Ghosted pipeline):
**5 total rows across 3 profiles, project-wide.** Whatever the cause — discoverability, the
feature not being valuable as built, or something else — this is worth someone actually looking
at on its own merits; it's not a data problem to route around, it's a product-adoption question.
Not investigated further here since it's outside the scope of what surfaced it.

### Supabase client

- `supabase` (from `src/lib/supabase.ts`) is **only** used in API helpers under `src/lib/`
- **Views, stores, and composables never import `supabase` directly**. They call the API API helpers under `src/lib/` instead.

### Database (schema & types)

- For database schema, types, see docs: `docs/db-schema-summary.md`.
- For how AI should use them, see Cursor rule: `.cursor/rules/db-schema.mdc`.
- **Apollo budgeting** (per-process credits, Premium Insights, job processor): see `docs/apollo-limits.md`.
- **User-editable subsets**: When an API or form should only allow updating a subset of columns (e.g. to avoid letting callers change `role`, `organization_id`, or other sensitive fields), define a narrowed type in `src/types/database.ts`—e.g. `ProfileUserEditable` as `Pick<ProfileUpdate, ...>`—and use that for the public API. This keeps the allowed-field set in one place and documents the boundary next to the other profile types.

### Admin roles and permissions

We use two application-level roles, backed by the `roles` / `profile_roles` tables:

- **`admin`**
  - Can access internal admin tools and dashboards (e.g. `/admin/dashboard`, job matching configuration, settings).
  - Intended for operational and support tasks, not for managing other admins.
  - **Cannot** access the admin-management page or change any user’s roles/permissions.

- **`super_admin`**
  - A strictly higher-privilege role used **only** for:
    - Gating access to the admin-management page (`/admin/admin-management`).
    - Calling role/permissions management edge functions (`assign-role`, `list-admin-users`).
  - Can view all users and manage their admin-related permissions (currently `admin` and `super_admin`) via the admin-management UI.
  - **Cannot** be assigned without `admin` also being present on the same user (the backend enforces `super_admin ⇒ admin`).
  - Users are **not allowed** to modify their own permissions; edge functions reject attempts where caller and target refer to the same profile, and the UI disables the “Manage permissions” control on the current user’s row.

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