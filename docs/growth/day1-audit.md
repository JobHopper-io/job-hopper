# Growth day-1 audit

Snapshot of the repo as of 2026-11-20 (branch `revenue-data-model`). Covers leads, user lifecycle and email. Facts only; recommendations come later.

## 1. What exists and can be reused

### Leads and outbound

| Asset | Location | What it does |
|---|---|---|
| `institutional_leads` | `supabase/migrations/20260814140000_institutional_leads.sql` | One row per organization: category, score, one decision-maker name/title/email, `status`, `campaign`, `reply_class`, `signals` jsonb, last-send fields. Unique on `(organization_name, source)`. Service-role only (RLS on, no policies). |
| Lead connectors | `scripts/college-scorecard-connector.mjs`, `scripts/warn-connector.mjs`, `scripts/career-partner-connector.mjs` | Upsert universities (College Scorecard), WARN-notice employers (warnfirehose), and career partners (Apollo org search) into `institutional_leads`. Run by hand. |
| Inbound partner leads | `supabase/functions/submit-partner-lead` | Landing-page form → `institutional_leads` + internal alert email. |
| Enrichment + dry run | `scripts/outbound-dry-run.mjs` | Apollo decision-maker lookup (within `try_consume_apollo_credits` budget), template render, logs to `outbound_dry_run_log`. |
| Live send | `scripts/outbound-live-send.mjs` | Sends through the Mailtrap API; checks `exclusion_lists` before each send; de-duplicates by inbox; per-category From name and Reply-To; UTM-tagged links; `--preview` mode. |
| `exclusion_lists` | `20260306120000_update_exclusion_lists_schema.sql` | Company-level do-not-contact list (`company_name` unique). Written by the job processor (recruiting agencies) and `classify-replies` (unsubscribes). |
| Reply capture | `email-router-worker/`, `supabase/functions/reply-ingest`, `reply_events` | Cloudflare Email Routing on `job-hopper.co` → `reply-ingest` → `reply_events`, matched to a lead by sender email. |
| Reply classification | `supabase/functions/classify-replies` | LLM classifies replies; an Unsubscribe adds the org to `exclusion_lists`. Cron must be created by hand. |
| Bounce webhook | `supabase/functions/mailtrap-bounce-webhook` | Verifies the Mailtrap signature; a hard bounce sets `institutional_leads.status = 'bounced'`. |
| Admin views | `admin-institutional-leads`, `admin-growth-dashboard`, `admin-reply-events`, `src/views/AdminReplyClassification.vue` | Lead list, funnel, and reply review. |
| Revenue-automation tables | `20260906120000_revenue_automation_schema.sql` | `calls`, `call_extractions`, `lead_scores`, `objections`, `followup_sequences`. Schema only; nothing populates `calls.ringcentral_call_id`. |

### User lifecycle

| Asset | Location | What it does |
|---|---|---|
| `profiles` | `src/types/database.ts`, migrations | Created by the `handle_new_user()` trigger at signup. Has `onboarding_completed`, `resume_bucket_key`, `stripe_customer_id`, `last_active_at`, UTM fields, `trial_grant_id`, `org_account_id`. |
| `subscriptions` / `subscription_product` / `products` | `20260220110000` onward | Stripe-backed plan state. Status enum: `trial`, `active`, `canceled`, `past_due`. |
| `freemium_usage`, `job_matches`, `saved_jobs`, `resume_products` | migrations | Usage and engagement per profile. |
| Stripe webhook | `supabase/functions/stripe-webhook` | Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`. Logs every event to `stripe_webhook_events`. |
| Activity heartbeat | `touch_last_active()` RPC, called from `src/router/index.ts:557` | Updates `profiles.last_active_at`, at most once an hour. Live since 2026-10-16. |
| Segment engine | `supabase/functions/admin-revenue-recovery-segments`, `_shared/revenue-recovery-segments.ts` | Computes 7 B2C segments (never activated, activated never paid, cancelled, no login 30d, heavy free usage, high match, visa-focused) and can email them. |

### Email

| Asset | Location | What it does |
|---|---|---|
| `sendEmail` | `supabase/functions/_shared/email.ts`, `email-provider.ts` | Mailtrap send with one retry; logs to `email_events` when the caller passes a profile and event type. No custom headers. |
| `email_events` | `20260302100000_notification_email_schema.sql` | Per-profile send log (`sent`/`failed`, provider message id). |
| `notification_settings` | same migration | Per-profile category toggles + global `email_unsubscribed_at`. |
| Signed unsubscribe | `_shared/unsubscribe-token.ts`, `supabase/functions/unsubscribe-email` | HMAC token valid for 1 year, signed with `UNSUBSCRIBE_EMAIL_SECRET`; sets `email_unsubscribed_at`. |
| Attribution capture | `src/App.vue:134-160` → `src/lib/auth.ts:102` → `handle_new_user()` | `utm_source`/`medium`/`campaign`, `landing_path`, `referrer_host` saved on `profiles`. Outbound links carry `utm_source=email_outbound`. |

## 2. Gaps for the growth plan

### Lead schema
- `institutional_leads` holds one contact per organization; there is no people/contacts table.
- Lead identity is `(organization_name, source)`, so one organization appears once per source.
- `bd_leads` (small companies that are hiring, written by the job processor) holds company names only and has no downstream consumer. Its `linkedin_url` column exists in the live DB but in no migration.
- `enriched_lead` is unused by any code in the repo.
- Connectors and sends are manual scripts, not scheduled.
- There's no send history per lead; only the last attempt is kept.

### Source attribution
- UTMs are captured only on the first page view of a session (`sessionStorage`) and saved once at signup. There's no touch history.
- `referred_by_institutional_lead_id` is a best-effort exact match on email.
- Cold outbound sends are not in `email_events`.

### Consent and suppression
- The signup "account and marketing emails" checkbox is required but **not stored**. SMS consent is not stored either.
- There is no marketing category in `notification_settings`; revenue-recovery emails are gated only by the global unsubscribe.
- Suppression is split:
  - `exclusion_lists` is per company and has no email column.
  - `notification_settings` is per profile.
  - Neither system checks the other.
- **Outbound templates have no unsubscribe link and no postal address.** Opting out depends on an LLM classifying a reply correctly.
- `sendEmail` can't set `List-Unsubscribe` headers.
- `unsubscribe-email` changes state on GET, which link scanners can trigger. With no `UNSUBSCRIBE_EMAIL_SECRET`, the footer falls back to `/profile?unsubscribe=1`, which does nothing.
- The bounce webhook handles hard bounces for `institutional_leads` only. Spam complaints and bounces on profile addresses are ignored.
- Transactional and cold mail share one Mailtrap stream and From address (code default `no-reply@job-hopper.io`). The production `MAILTRAP_FROM` value isn't in the repo, and no SPF/DKIM/DMARC setup for Mailtrap is documented.

### Abandoned checkout tracking
- `checkout_attempts` (`20260906130000`) exists, but its writers, in `create-checkout-session` and a `checkout.session.expired` handler, exist only on the unmerged `sms-checkbox` branch (commit `dacc866`).
- In production it has 2 `expired` + 10 `completed` rows dated 2026-09-07 to 2026-10-06, and nothing after. The `sms-checkbox` functions were probably deployed and then overwritten by a later deploy from `main`, so tracking has been off since about 2026-10-06.
- Current proxy: `profiles.stripe_customer_id` is set when checkout starts. Not null with no subscription means the user abandoned checkout. The proxy has no timestamp.

### Activity tracking
- `profiles.last_active_at` has data only from 2026-10-16. Before that, only `auth.users.last_sign_in_at` exists, which misses users whose sessions refresh silently.
- `subscriptions` has no `created_at`, `canceled_at` or status history. Cancel-at-period-end is computed in the webhook but not stored.
- Stripe `incomplete` and `unpaid` both map to `canceled`.
- There's no resume upload timestamp, and no test/demo account flag.
- Generated `src/types/supabase.ts` is stale (missing `subscriptions.past_due_since`).

### Reply handling
- Replies match leads only by exact `contact_email`. Unmatched replies are logged, not suppressed.
- The `classify-replies` cron is not set up in code.
- An Unsubscribe suppresses the whole company, not the person.
- README.md:58 still says nothing calls `reply-ingest`. README.md:47 and docs/architecture.md:170 give the wrong `MAILTRAP_FROM` fallback.

### Status on branch `growth/suppression` (2026-11-21, not deployed)

Built and tested on the branch; nothing is live until it's deployed (see [deploy-growth-suppression.md](deploy-growth-suppression.md)). Design: [lead-system-design.md](lead-system-design.md).

| Gap | Status |
|---|---|
| Lead schema: no people/contacts table | **Built**: `prospects` + `prospect_evidence`, linked to `institutional_leads`, `profiles` (at signup), `reply_events`, `email_events`, `lead_scores`; `prospect_send_eligibility` view. Nothing sends to prospects yet. |
| Lead schema: no send history per lead | **Built**: `email_events` is the single send log (type `outbound`, campaign, lead, message id), backfilled from past sends; webhook records delivered / bounced / complained. |
| Lead schema: `bd_leads` / `enriched_lead` unused; connectors manual | Open |
| Source attribution: first-touch only, no touch history | Open. `/unsubscribe` visits no longer record attribution. |
| Consent at signup not stored | **Built**: append-only `consent_records`, separate optional marketing box, legacy backfill (approximate, by commit date). Wording pending approval. |
| No marketing category / consent gate | **Built** for revenue-recovery real sends (`current_marketing_consent`). System announcements still use the per-category opt-in. |
| Split suppression (company vs profile) | **Built**: global `suppressed_emails`, checked by `sendEmail` and the outbound script; `exclusion_lists` kept for companies. |
| Outbound templates: no unsubscribe link or postal address | **Built**: per-recipient signed link + `OUTBOUND_POSTAL_ADDRESS` footer; live send refuses to start without them. |
| No `List-Unsubscribe` headers | **Built** on marketing sends and outbound (one-click, RFC 8058). |
| Unsubscribe on GET; silent fallback link | **Built**: GET only shows a confirm page, POST writes; missing secret now fails closed. |
| Bounces only for leads; complaints ignored | **Built**: bounce, spam and unsubscribe events suppress any address. |
| Shared sending stream / From address | Open (sending domain decision) |
| Abandoned checkout: `checkout_attempts` not written | Open (only the `stripe_customer_id` proxy, now on the dashboard) |
| Activity tracking gaps; no subscription history | Open |
| Reply matching only on `contact_email` | **Built**: replies also match prospects; an Unsubscribe reply suppresses the sender even with no lead match. `classify-replies` cron still manual. |
| Stale generated types | Open: a cast in `src/lib/notifications.ts` stands in until the migrations are pushed and `npm run db:types` re-runs. |
| Baseline dashboard | **Built**: segments + outbound funnel on the admin growth dashboard (`growth_dashboard_counts()`). |

## 3. External access still needed

| Access | Needed for | Current state in repo | Owner |
|---|---|---|---|
| RingCentral API | Call ingestion into `calls` | Schema only; `calls.ringcentral_call_id` is nullable and never written | Nick (pending) |
| HeyGen | Video outreach | No references in repo | Nick (pending) |
| Separate sending domain | Cold outbound, kept apart from transactional mail | All mail sends from one address (code default `no-reply@job-hopper.io`); Reply-To on `job-hopper.co` | Nick (pending) |
| Postal address | Footer of every outbound email (`OUTBOUND_POSTAL_ADDRESS`); a live outbound send refuses to start without it | Not set anywhere | Nick (pending) |
| LLM provider billing (replacing the ngrok Courier tunnel) | Job processor domain resolution, edge-function LLM calls | Edge functions read `LLM_API_KEY`/`LLM_BASE_URL` (`_shared/llm.ts`). The job processor routes domain confirmation through an n8n webhook because the "Courier" key is locked inside n8n (`domain_resolution.py:175`). The ngrok tunnel itself isn't in the repo. | Nick (pending) |
| Netlify | Frontend deploys and env vars | `netlify.toml` present | Nick (pending) |
| Hostman VPS | Presumably the job-processor-service host | No references in repo; the host is only reachable via the `JOB_PROCESSOR_URL` secret | Nick (pending) |

## 4. Baseline 2026-11-20

Production counts from the queries in section 5. Segments overlap.

| Segment | Count | Note |
|---|---|---|
| Registered | 341 | |
| Email confirmed | 315 | |
| Email unconfirmed | 26 | |
| Confirmed, not onboarded | 128 | |
| Resume uploaded | 181 | |
| Onboarded, no resume | 25 | |
| Inactive 30d | 179 | Overstated: `last_active_at` only has data from 2026-10-16 |
| Abandoned checkout (proxy) | 24 | `stripe_customer_id` set, no subscription; no timestamp |
| Active paid | 8 | |
| Trial | 0 | |
| Past due | 0 | |
| Cancelled | 28 | |
| Sponsored seat holders | 65 | trial grant or org licence |

`checkout_attempts`: 2 `expired` + 10 `completed` rows, 2026-09-07 to 2026-10-06, none after (see section 2, abandoned checkout tracking).

## 5. Segment SQL

Run in the Supabase SQL editor; it runs as `postgres`, which can read `auth.users`.

The base population excludes:
- partner staff
- license billing contacts
- admins
- university-license subscriptions

Segments overlap. Inactive covers only onboarded users.

```sql
-- 0) Is checkout_attempts being written? (rows => the sms-checkbox code was deployed)
select status, count(*), min(created_at), max(created_at)
from public.checkout_attempts
group by status;

-- 1) All segment counts in one row
with b2c_subs as (
  select s.*
  from public.subscriptions s
  where not exists (select 1 from public.org_accounts o where o.subscription_id = s.id)
),
sub_flags as (
  select profile_id,
         bool_or(status = 'active')   as has_active,
         bool_or(status = 'trial')    as has_trial,
         bool_or(status = 'past_due') as has_past_due,
         bool_or(status = 'canceled') as has_canceled
  from b2c_subs
  group by profile_id
),
base as (
  select p.id,
         p.onboarding_completed,
         p.resume_bucket_key,
         p.stripe_customer_id,
         p.trial_grant_id,
         p.org_account_id,
         u.email_confirmed_at,
         greatest(p.last_active_at, u.last_sign_in_at) as last_seen_at,
         f.profile_id is not null        as has_any_sub,
         coalesce(f.has_active,   false) as has_active,
         coalesce(f.has_trial,    false) as has_trial,
         coalesce(f.has_past_due, false) as has_past_due,
         coalesce(f.has_canceled, false) as has_canceled
  from public.profiles p
  join auth.users u on u.id = p.auth_user_id
  left join sub_flags f on f.profile_id = p.id
  where not exists (select 1 from public.partner_staff ps where ps.email = lower(p.email))
    and not exists (select 1 from public.org_accounts o where o.billing_profile_id = p.id)
    and not exists (select 1 from public.profile_roles pr where pr.profile_id = p.id)
    -- and p.email not in ('demo@...')   -- known demo/test accounts
)
select
  count(*)                                                                    as registered,
  count(*) filter (where email_confirmed_at is not null)                      as registered_confirmed,
  count(*) filter (where email_confirmed_at is null)                          as incomplete_unconfirmed_email,
  count(*) filter (where email_confirmed_at is not null
                     and onboarding_completed is not true)                    as incomplete_not_onboarded,
  count(*) filter (where resume_bucket_key is not null)                       as resume_uploaded,
  count(*) filter (where onboarding_completed is true
                     and resume_bucket_key is null)                           as onboarded_no_resume,
  count(*) filter (where onboarding_completed is true
                     and (last_seen_at is null
                          or last_seen_at < now() - interval '30 days'))      as inactive_30d,
  count(*) filter (where stripe_customer_id is not null
                     and not has_any_sub)                                     as abandoned_checkout_proxy,
  count(*) filter (where has_active)                                          as active_paid,
  count(*) filter (where has_trial and not has_active)                        as trialing_unpaid,
  count(*) filter (where has_past_due and not has_active and not has_trial)   as past_due,
  count(*) filter (where has_canceled and not has_active and not has_trial)   as cancelled,
  count(*) filter (where trial_grant_id is not null
                     or org_account_id is not null)                           as sponsored_seat_holders
from base;

-- 2) Exact abandoned checkout, last 30 days (only meaningful if query 0 returns rows)
select count(distinct ca.profile_id) as abandoned_checkout_30d
from public.checkout_attempts ca
where ca.status in ('started', 'expired')
  and ca.created_at > now() - interval '30 days'
  and not exists (
    select 1 from public.checkout_attempts c2
    where c2.profile_id = ca.profile_id
      and c2.status = 'completed'
      and c2.created_at >= ca.created_at
  )
  and not exists (
    select 1 from public.subscriptions s
    where s.profile_id = ca.profile_id
      and s.status in ('active', 'trial')
  );

-- 3) Inactivity fallback for users with no last_active_at (pre-2026-10-16):
--    last real user action from saved jobs / resume advice
select count(*) as inactive_by_actions_30d
from public.profiles p
where p.onboarding_completed is true
  and p.last_active_at is null
  and coalesce(
        greatest(
          (select max(created_at) from public.saved_jobs s where s.profile_id = p.id),
          (select max(created_at) from public.resume_products r where r.profile_id = p.id)
        ),
        'epoch'::timestamptz
      ) < now() - interval '30 days';
```
