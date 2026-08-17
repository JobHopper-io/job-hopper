## Job Hopper

This project uses Supabase as its primary database.

### Supabase types

- Generated database types live in `src/types/supabase.ts` as the `Database` type.
- These types are generated from the Supabase schema and should **never be edited by hand**.

To regenerate the types after changing the database schema or migrations, run:

```bash
npm run db:types
```

This command calls:

```bash
supabase gen types typescript --schema public > src/types/supabase.ts
```

Make sure to commit any changes to `src/types/supabase.ts` when you update the schema.

### Pre-commit hook for Supabase types

This repository includes an pre-commit hook script at `.githooks/pre-commit-supabase-types` that helps keep `src/types/supabase.ts` in sync with the database schema.

To enable it locally, point Git at the `.githooks` directory:

```bash
git config core.hooksPath .githooks
```

After that, each commit will:

- Regenerate Supabase types using the same command as `npm run db:types`.
- Fail the commit if `src/types/supabase.ts` changes and is not yet staged, prompting you to add it.

### Email notifications (Mailtrap)

Edge functions (e.g. `match-jobs`, `stripe-webhook`, `send-system-announcement`) send transactional emails via a shared `sendEmail` helper in `supabase/functions/_shared/`, backed by **Mailtrap Email Sending**.

- **Code path**: `supabase/functions/_shared/email.ts` → `supabase/functions/_shared/email-provider.ts` → Mailtrap `POST /api/send` on `https://send.api.mailtrap.io`.
- **Required Edge Function secrets** (set via Supabase dashboard or `supabase secrets set`):
  - `MAILTRAP_API_TOKEN`: Mailtrap Email Sending API token.
  - `MAILTRAP_BASE_URL` (optional): defaults to `https://send.api.mailtrap.io`.
  - `MAILTRAP_FROM` (optional): default `From` address, e.g. `"Job-Hopper" <no-reply@example.com>`. If omitted, falls back to `Job-Hopper <no-reply@mailtrap.io>`.
  - `UNSUBSCRIBE_EMAIL_SECRET`: HMAC secret used to sign one‑click unsubscribe tokens.
  - `SITE_URL`: Base URL for links in emails (e.g. `https://app.job-hopper.com`).

If `MAILTRAP_API_TOKEN` is not set in a given environment, email sends will return `success: false` with a clear error message, but core flows will still succeed (job matching, subscription updates, announcements). This makes it safe to run locally without a Mailtrap account.

To test in a non‑production environment:

1. Create a Mailtrap project and Email Sending API token.
2. Set the above secrets for your local Supabase Edge Functions.
3. Trigger an email (e.g. complete checkout to hit `stripe-webhook`, or invoke `match-jobs` / `send-system-announcement` via the Supabase CLI).
4. Verify delivery in the Mailtrap Email Sending dashboard or logs.

### SEO static pages (Netlify build)

On every Netlify deploy, after `vite build`, `scripts/generate-seo-pages.mjs` reads
the `seo_pages` table (populated independently by n8n) and pre-renders one static
HTML file per indexed row into `dist/<url_path>/index.html`, plus `dist/sitemap.xml`.
This keeps the SEO landing pages crawlable (the Vue SPA is client-rendered).

**Required Netlify build environment variables** (set in Netlify site settings, not the repo):

- `SUPABASE_URL`: project the n8n workflow writes `seo_pages` to.
- `SUPABASE_SERVICE_ROLE_KEY`: build-only, read-only use — used solely to query
  `seo_pages` at build time. Never written into generated HTML, never logged.
- `SITE_URL`: public origin for canonical tags + the sitemap, e.g. `https://job-hopper.io`.
  Required; the build fails loudly if unset. **Note:** this is a *Netlify build var*
  and is distinct from the same-named Supabase Edge Function secret used for email links.
- `SIGNUP_URL` (optional): CTA target on each page (an absolute URL like
  `https://app.job-hopper.io/register`, or a path like `/register`). Defaults to
  `/register` with a warning when unset.

A row whose `page_type` is unknown/unsupported is warned about and skipped; it never
fails the build. The generator prints a summary of pages generated vs. skipped.

### College Scorecard lead connector (run manually)

`scripts/college-scorecard-connector.mjs` pulls U.S. university data from the College
Scorecard public API, scores each school as an institutional sales opportunity, and
upserts into `institutional_leads` (keyed on `organization_name, source`). Run it
locally, one state at a time:

```bash
COLLEGE_SCORECARD_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/college-scorecard-connector.mjs TX
```

- `COLLEGE_SCORECARD_API_KEY`: free key from https://api.data.gov/signup/.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: the project `institutional_leads` lives in.
- State argument defaults to `TX` if omitted.

Not wired into any scheduled job — deliberately manual per state until the first run's
output has been spot-checked.

### WARN layoff-notice connector (run manually)

`scripts/warn-connector.mjs` pulls WARN Act mass-layoff notices from warnfirehose.com
(a third-party aggregator of the 50-state public filings) and upserts each employer into
`institutional_leads` (source='warn', category='employer'), keyed on
`organization_name, source`. Also prints a notices-by-state+industry count to the
console as the B2C geo-targeting signal — not written to a table yet.

```bash
WARN_FIREHOSE_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/warn-connector.mjs TX
```

- `WARN_FIREHOSE_API_KEY`: free key from warnfirehose.com/account.
- Free tier is 25 calls/day, 25 records/call — this script makes one call, no
  pagination, by design. Revisit if/when the $49/mo Starter tier is approved.
- State argument defaults to `TX`; an optional second argument sets `date_from`
  (`YYYY-MM-DD`).

### Outbound dry-run + contact enrichment (run manually)

`scripts/outbound-dry-run.mjs` pulls the top 20 `institutional_leads` (university/employer,
`opportunity_score >= 50`, `status = 'new'`), checks `exclusion_lists` suppression, enriches
any lead missing `contact_email` via Apollo (real write to
`institutional_leads.decision_maker_name/title/contact_email` — capped to
`ENRICHMENT_DRY_RUN_CAP` leads per run, currently `BATCH_LIMIT` (20), raised from an
initial cap of 5 once the first small batch was verified), renders the matching persona
template, and logs every render to `outbound_dry_run_log`. **No email is ever actually
sent** — `sendEmail` is not called by this script. Pass `--only="Name1,Name2"` to
restrict a run to specific `organization_name`s (e.g. re-testing a prior miss without
touching the rest of the batch).

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... APOLLO_API_KEY=... \
  node scripts/outbound-dry-run.mjs
```

- `APOLLO_API_KEY`: same Apollo account used by `premium-insights`; credits are metered
  separately under the `institutional_lead_enrichment` row in `apollo_limits` (200
  credits, see `docs/apollo-limits.md`) so this can't eat into that budget.
- A lead whose enrichment doesn't resolve to a real, emailed contact is skipped for that
  run — nothing is fabricated, and `institutional_leads` is left untouched for it.

### Career partner discovery connector (run manually)

`scripts/career-partner-connector.mjs` searches Apollo's `mixed_companies/search` by
keyword tag + metro (career coaches, immigration professionals, training providers,
outplacement firms) and upserts results into `institutional_leads`
(source='apollo_career_partner', category='career_partner'), keyed on
`organization_name, source`. Apollo-based per v2 of the build spec — the original
Google Places design was blocked on billing infra unrelated to the task.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... APOLLO_API_KEY=... \
  node scripts/career-partner-connector.mjs
```

- Metros and categories are hardcoded consts at the top of the file (`METROS`,
  `CATEGORY_KEYWORDS`) — edit directly to change scope, same pattern as the other
  connectors' state/limit constants.
- Credits are metered under the `career_partner_discovery` row in `apollo_limits` (200
  credits) — one `mixed_companies/search` call per category/metro combo, no per-org
  people lookup (this connector only discovers organizations, not contacts).
- **`opportunity_score` is currently always `null`.** Verified against a live call:
  this search mode doesn't return `city`, `state`, `industry`, or employee count at
  all — only name/website/domain/revenue fields. Scoring needs a product decision
  (score off `organization_revenue` instead, or spend a second per-org
  `organizations/enrich` call) before it can work; see the comment above
  `OPPORTUNITY_BUCKETS` in the script.
- **No pagination yet.** Every category/metro combo in the first test run returned
  exactly `per_page` (25) results, which likely means more exist — revisit before
  trusting a metro/category pair as fully covered.
