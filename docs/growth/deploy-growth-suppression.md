# Deploying `growth/suppression`

Branch: `growth/suppression`, based on `revenue-data-model` at `1e5dd19`. Design: [lead-system-design.md](lead-system-design.md). Audit and baseline: [day1-audit.md](day1-audit.md).

Order matters. Edge functions call RPCs that only exist after the migrations, and `unsubscribe-email` redirects to a frontend page that only exists after the frontend deploy. So: **migrations → frontend → edge functions**.

## 0. Before deploying

**Secrets** (Supabase dashboard → Edge Functions → Secrets, or `supabase secrets list`, which shows names, not values):

| Secret | Why it matters now |
|---|---|
| `UNSUBSCRIBE_EMAIL_SECRET` | **Required.** Footer links no longer fall back silently. Without it every marketing send is refused, and transactional footers link to `/profile` instead of a one-click unsubscribe. `unsubscribe-email` POSTs return 500. |
| `SUPABASE_URL` | Injected by the runtime; confirm it's the `https://` project URL. Unsubscribe links and the suppression check are built from it. One-click `List-Unsubscribe` needs HTTPS. |
| `SITE_URL` | The `/unsubscribe` redirect target and footer preference links. |
| `MAILTRAP_WEBHOOK_SECRET` | The webhook rejects every request without it. |
| `MAILTRAP_FROM`, `MAILTRAP_API_TOKEN` | Unchanged, but test sends depend on them. |

**For running the outbound scripts locally** (not Supabase secrets): `UNSUBSCRIBE_EMAIL_SECRET` (the same value as the Supabase secret) and `OUTBOUND_POSTAL_ADDRESS`. A live send refuses to start without them.

**Checks on the hosted DB:**
- `supabase db push --dry-run` should list exactly the 9 migrations below.
- The consent and prospect migrations each create a trigger on `auth.users`. That worked locally; if the hosted project refuses it, the migration fails and rolls back (each file runs in its own transaction). Nothing is half-applied, but steps 1.8–1.9 would need another approach.
- `handle_new_user()` is not modified by any migration here. The two new `auth.users` triggers are separate and are named to run after `on_auth_user_created`.

## 1. Migrations (in filename order)

`supabase db push` applies them in this order, each in its own transaction:

| # | File | What it does |
|---|---|---|
| 1.1 | `20261120120000_suppressed_emails.sql` | `suppressed_emails`, `normalize_email()`, `is_email_suppressed()`; backfills unsubscribed profiles and bounced leads |
| 1.2 | `20261120130000_unsubscribe_writes.sql` | `suppress_email()`, `apply_unsubscribe()`, `set_own_email_unsubscribed()` |
| 1.3 | `20261120140000_email_event_type_outbound.sql` | enum value `outbound` (own file: `ADD VALUE`) |
| 1.4 | `20261120140100_email_event_status_delivery.sql` | enum values `delivered`, `bounced`, `complained` |
| 1.5 | `20261120140200_email_events_send_log.sql` | `email_events` send-log columns, indexes, `to_email_normalized` backfill, `record_email_delivery_event()` |
| 1.6 | `20261120140300_email_events_outbound_backfill.sql` | one outbound row per past send from `institutional_leads` |
| 1.7 | `20261121120000_consent_records.sql` | consent wordings, `consent_records`, legacy backfill (by commit-date bands), `on_auth_user_created_record_consent` trigger, `current_marketing_consent()`, `set_own_marketing_consent()`, `apply_unsubscribe()` with a revoke row |
| 1.8 | `20261121130000_prospects.sql` | `prospects`, `prospect_evidence`, `prospect_id` FKs/columns, `prospect_send_eligibility`, `on_auth_user_created_link_prospect` trigger |
| 1.9 | `20261121140000_growth_dashboard_counts.sql` | `growth_dashboard_counts()` |

Then regenerate the types from the hosted project and remove the temporary cast:

1. `npm run db:types` regenerates `src/types/supabase.ts` from the hosted schema. It has to run after the push: regenerating from a local DB would drop hosted-only tables (`outreach_leads`, `job_demand_signal`, `job_demand_weekly_counts`, `bd_leads.linkedin_url`), and the hosted schema doesn't have these migrations until they're pushed.
2. In `src/lib/notifications.ts`, delete the `PendingRpcs` cast and call `supabase.rpc(...)` directly. Run `npm run build`, then commit.

The frontend in step 2 works with the cast still in place, so this can follow the deploy.

**Rollback.** There are no down migrations. Run these in reverse order, only after rolling back the edge functions (step 3), which call these objects:

```sql
-- 1.9
drop function if exists public.growth_dashboard_counts();
-- 1.8
drop trigger if exists on_auth_user_created_link_prospect on auth.users;
drop function if exists public.link_signup_prospect();
drop view if exists public.prospect_send_eligibility;
alter table public.lead_scores drop constraint lead_scores_has_subject;
alter table public.lead_scores add constraint lead_scores_has_subject check (profile_id is not null or institutional_lead_id is not null);
alter table public.lead_scores drop column if exists prospect_id;
alter table public.reply_events drop column if exists prospect_id;
alter table public.email_events drop constraint if exists email_events_prospect_id_fkey;
drop table if exists public.prospect_evidence, public.prospects;
-- 1.7 (restore 1.2's apply_unsubscribe by re-running 20261120130000_unsubscribe_writes.sql afterwards)
drop trigger if exists on_auth_user_created_record_consent on auth.users;
drop function if exists public.record_signup_consent(), public.current_marketing_consent(uuid), public.set_own_marketing_consent(boolean, text);
drop table if exists public.consent_records, public.accepted_marketing_wordings, public.consent_wordings;
-- 1.6
delete from public.email_events where type = 'outbound' and payload ->> 'backfilled' = 'true';
-- 1.5
drop function if exists public.record_email_delivery_event(text, text, timestamptz);
alter table public.email_events
  drop column if exists prospect_id, drop column if exists institutional_lead_id, drop column if exists to_email_normalized,
  drop column if exists campaign, drop column if exists sequence_stage, drop column if exists delivered_at,
  drop column if exists bounced_at, drop column if exists complained_at;
-- 1.3 / 1.4: enum values can't be dropped in Postgres; they're harmless once unused.
-- 1.2
drop function if exists public.set_own_email_unsubscribed(boolean), public.apply_unsubscribe(text, text, uuid, text),
  public.suppress_email(text, text, text, text, uuid, text);
-- 1.1
drop function if exists public.is_email_suppressed(text, text);
drop table if exists public.suppressed_emails;
drop function if exists public.normalize_email(text);
```

Also delete the rolled-back versions from `supabase_migrations.schema_migrations`, or later pushes will skip them.

## 2. Frontend (Netlify)

Deploy the branch's frontend. It contains:
- the `/unsubscribe` confirm page
- the split signup checkboxes (consent metadata)
- the profile marketing toggle and the "unsubscribe from all" toggle via RPC
- the dashboard tables
- `Referrer-Policy: no-referrer` for `/unsubscribe` in `netlify.toml`

It needs the migrations: signup metadata is recorded by the 1.7 trigger, and the profile toggles call 1.2 / 1.7 RPCs.

**Rollback:** in Netlify, Deploys → publish the previous production deploy. The DB objects can stay; the old frontend doesn't use them.

## 3. Edge functions

Deploy every function below; 18 functions bundle changed code. Each function bundles its own copy of `_shared`, so a function whose `index.ts` didn't change still needs a redeploy when a `_shared` file it imports changed.

```sh
for f in admin-growth-dashboard admin-org-accounts admin-revenue-recovery-segments admin-send-announcement \
  admin-send-test-email classify-replies employer-request-reveal mailtrap-bounce-webhook match-jobs \
  partner-pilot-reminders partner-portal reply-ingest run-scheduled-jobs send-system-announcement \
  sponsor-watch-check stripe-webhook submit-partner-lead unsubscribe-email; do
  supabase functions deploy "$f" || break
done
```

| Function | Why |
|---|---|
| `unsubscribe-email` | GET → `/unsubscribe` page, POST writes; v2 tokens |
| `mailtrap-bounce-webhook` | suppression for bounce/spam/unsubscribe; send-log delivery updates |
| `classify-replies` | Unsubscribe replies suppress the sender |
| `reply-ingest` | matches prospects; ILIKE escape |
| `admin-growth-dashboard` | segments, funnel, paid/trial split, send-log counts |
| `admin-revenue-recovery-segments` | marketing consent gate; signed test-send links |
| `admin-send-announcement`, `send-system-announcement` | marketing kind + signed links (shared `system-announcement-send.ts`) |
| `admin-send-test-email`, `admin-org-accounts`, `employer-request-reveal`, `match-jobs`, `partner-pilot-reminders`, `partner-portal`, `run-scheduled-jobs`, `sponsor-watch-check`, `stripe-webhook`, `submit-partner-lead` | `sendEmail` now takes `kind`, checks suppression, writes `to_email_normalized`; footer links fail closed |

**Rollback:** redeploy the previous code for the same functions. Roll back functions before migrations.

```sh
git worktree add /tmp/rollback origin/revenue-data-model
cd /tmp/rollback && for f in <same list>; do supabase functions deploy "$f"; done
```

The old functions don't use any new DB object, so they work with or without the migrations.

## 4. Post-deploy checks

1. **Marketing test send with raw headers.** Admin → Announcements → send a test to your own address. Open the raw message (Gmail: ⋮ → Show original) and check:
   - `List-Unsubscribe: <https://<project>.supabase.co/functions/v1/unsubscribe-email?token=…>`
   - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
   - the footer link matches the header URL

   If the headers are missing, Mailtrap didn't accept the `headers` field; the field name came from the SDK types, since the REST docs weren't reachable.
2. **Referrer-Policy:** `curl -sI https://job-hopper.io/unsubscribe | grep -i referrer` should print `referrer-policy: no-referrer`. If it doesn't, the header isn't applied through the SPA rewrite. The page still strips the token from the URL on load.
3. **Gmail unsubscribe, end to end:**
   - Use Gmail's Unsubscribe button on the test email (one-click POST). A `suppressed_emails` row (reason `unsubscribe`, scope `marketing`) and a `consent_records` revoke should appear for your address.
   - Separately, click the footer link. `/unsubscribe` shows your masked address, and confirming shows "You're unsubscribed".
   - Clean up afterwards: on `/profile`, turn marketing emails back on; that clears the marketing-scope row.
4. **Webhook updates the send log.** After the test send:
   ```sql
   select status, delivered_at from email_events order by sent_at desc limit 1
   ```
   The newest row should show `delivered` with `delivered_at` within a minute or so. Also check the webhook logs for `statusUpdated`, and expect `unknownMessages` to stay 0 for new sends.
5. **Signup still works:**
   - Register a test account with the marketing box ticked: two `consent_records` rows (email `marketing_email_v1`, and SMS if ticked).
   - Register another with it unticked: rows with `granted = false`.
   - Create a user from the Supabase dashboard (no metadata): the user and profile exist, with no consent row.
   - An employer signup still creates `employer_accounts`.
6. **Dashboard:** Admin → Growth shows the segments and funnel tables. To confirm the segments equal the audit SQL, compare them directly on the hosted DB:
   ```sql
   select row_to_json(q) = (public.growth_dashboard_counts() -> 'segments')::json from (/* day1-audit.md section 5, query 1, without the trailing semicolon */) q;
   ```
   Or eyeball the two outputs side by side.

## 5. After deploy

- **Decide on the legacy consent wordings**, then optionally `insert into accepted_marketing_wordings (wording_version) values ('legacy_bundled_v0')` (and/or `'legacy_bundled_v0_mar2026'`). Until then, revenue-recovery real sends skip everyone who hasn't opted in through the new box.
- **Set `OUTBOUND_POSTAL_ADDRESS`** wherever the outbound scripts run.
- **Create the `classify-replies` cron** if it doesn't exist (unchanged: still manual).
