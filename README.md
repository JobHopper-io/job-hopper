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
