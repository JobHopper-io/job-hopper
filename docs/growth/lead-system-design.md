# Lead system design (proposal)

Status: proposal for review, 2026-11-20. Builds on [day1-audit.md](day1-audit.md). Schemas are sketches, not migrations. Step 1 (suppression) is being built on `growth/suppression`.

Goal: B2C outreach to individual job seekers as well as institutions, in **one connected lead system**:

**organization → person → profile**

## 1. Person-level leads

**Option A: add person rows to `institutional_leads`** (for example a `kind` column for org or person, plus the new fields).
- **For:** one table; the existing admin views, reply matching and bounce webhook work unchanged.
- **Against:** six tables use it as "the organization": `partner_staff`, `partner_seat_releases`, `org_accounts`, `trial_grants`, and the licence-billing tables. The partner functions (`partner_summaries`, `partner_insights`) would all need `kind = 'org'` filters, and each one missed would leak.
- **Against:** about 25 organization-only columns (`student_size`, `scorecard_id`, `recommended_package`, …) would be null for people, and `unique (organization_name, source)` makes no sense for a person.

**Option B: a new `prospects` table** with a nullable `institutional_lead_id` (the person's organization, if any) and a nullable `profile_id` (set when they sign up).
- **For:** organizations stay organizations; a job seeker has no organization; an institutional decision maker becomes a prospect linked to their organization.
- **For:** room for more than one person per organization, and dedupe by email across sources.
- **Against:** one more table, and `institutional_leads.contact_email` overlaps it until it's migrated.

**Chosen: B.**

```sql
prospects (
  id uuid pk default gen_random_uuid(),
  created_at, updated_at timestamptz,
  kind text not null check (kind in ('job_seeker','institution_contact')),
  institutional_lead_id uuid null references institutional_leads(id) on delete set null,
  profile_id uuid null unique references profiles(id) on delete set null,
  email text null,
  email_normalized text generated always as (normalize_email(email)) stored,  -- unique where not null
  first_name, last_name, linkedin_url text,
  country text,                        -- needed to decide which law applies
  source text not null,                -- 'reddit','linkedin','apollo','partner_form','warn',…
  source_ref text,                     -- external id; unique (source, source_ref)
  -- preferences: same names/types as profiles so they copy across 1:1 at signup
  target_job_title text, target_role_categories role_category[], preferred_locations text[],
  open_to_remote boolean, years_of_experience int, career_level career_level,
  requires_us_sponsorship boolean,
  consent_status text not null default 'none'
    check (consent_status in ('none','legitimate_interest','opted_in','opted_out')),
  do_not_contact boolean not null default false,   -- manual override
  fit_score numeric(5,2), fit_scored_at timestamptz,
  status text not null default 'new'   -- new / contacted / replied / converted / dead
)

prospect_evidence (                    -- one-to-many: a person can be found several times
  id uuid pk, prospect_id uuid not null references prospects on delete cascade,
  url text not null, snippet text, found_at timestamptz not null, source text not null,
  unique (prospect_id, url)
)
```

- **Contact eligibility** is a view, `prospect_send_eligibility`, computed at send time. It combines: email present, `consent_status`, `do_not_contact`, no row in `suppressed_emails`, and an allowed `country`. It's a view rather than a stored flag so it can't drift out of date when someone is suppressed.
- **Fit score history** reuses `lead_scores` by adding a `prospect_id` column; `prospects.fit_score` keeps only the latest score.
- **Linking at signup:** `handle_new_user()` already matches `institutional_leads.contact_email` by email. Add the same match on `prospects.email_normalized` to set `prospect.profile_id` and `status = 'converted'`.

### Mapping the existing `outreach_leads` table (hosted only)

The hosted DB has `outreach_leads` (no migration, nothing in the repo writes or reads it). It's one row per social post found, with no email and no person identifier beyond a display name. Not imported yet; this is how it would map:

| `outreach_leads` | Goes to | Notes |
|---|---|---|
| `id` | `prospects.source_ref` | One prospect per row. There's no stable person key, so two posts by the same person become two prospects until an email (`email_normalized` is unique) or a manual merge joins them. |
| `source` | `prospects.source` and `prospect_evidence.source` | Unique `(source, source_ref)` makes a re-import a no-op. |
| `poster_name` | `prospects.first_name` (whole string), `last_name` null | Can be a handle rather than a real name, so don't split it. |
| `post_url` | `prospect_evidence.url` | |
| `post_snippet` | `prospect_evidence.snippet` | |
| `found_at` | `prospect_evidence.found_at` | |
| `signal_type` | no column yet | Evidence-level ("what kind of post"). Needs `prospect_evidence.signal_type` (text) or the snippet; decide before importing. |
| `status` | `prospects.status` | Value mapping unknown; the hosted values have to be checked first (`select status, count(*) from outreach_leads group by 1`). |
| `created_at` | `prospects.created_at` | |
| (none) | `prospects.kind = 'job_seeker'`, `consent_status = 'none'`, `email` / `country` null | Every imported row starts ineligible (`no_email`) until enriched. |

**Files that change:**
- `handle_new_user()` (new migration)
- `src/types/database.ts` (aliases)
- `admin-institutional-leads`, or a new admin prospects view
- `reply-ingest` (match `prospects` as well as `contact_email`)
- `reply_events` (add `prospect_id`)

## 2. `suppressed_emails`

```sql
suppressed_emails (
  id uuid pk, created_at timestamptz default now(),
  email_normalized text not null,      -- normalize_email(): lowercased, whitespace-trimmed
  reason text not null check (reason in ('unsubscribe','hard_bounce','spam_complaint','manual')),
  scope text not null check (scope in ('marketing','all')),  -- bounce/spam = all
  source text not null,      -- 'unsubscribe-email','mailtrap-webhook','classify-replies','profile','admin','backfill_*'
  profile_id uuid null, provider_event_id text null,
  unique (email_normalized, reason)
)  -- RLS on, no policies (service role only)

is_email_suppressed(p_email text, p_kind text) returns boolean  -- service_role only
```

The table is append-only per reason, which keeps an audit trail. A send is blocked when any row has `scope = 'all'`, or when the send is marketing.

**Writers** (step 2):
- `unsubscribe-email`: reason `unsubscribe`. It also keeps setting `notification_settings.email_unsubscribed_at` for profiles.
- `mailtrap-bounce-webhook`: `bounce` → `hard_bounce`; Mailtrap's spam and unsubscribe events → `spam_complaint` / `unsubscribe`.
- `classify-replies`: an Unsubscribe also suppresses `from_email`.
- `Profile.vue` "unsubscribe all", through `src/lib/notifications.ts`.

A writer that hits `unique (email_normalized, reason)` should raise the scope to `all` if needed, never lower it.

**Readers:**
- `sendEmail` in `_shared/email.ts`, which takes a required `kind: 'transactional' | 'marketing'`.
- `outbound-live-send.mjs`, both on the initial load and in the fresh check before each send.
- Bulk senders (`system-announcement-send.ts`, `admin-revenue-recovery-segments`) can later load the suppression set once per batch instead of once per recipient.

**Backfill:**
- emails of profiles with `email_unsubscribed_at` set
- `institutional_leads.contact_email` where `status = 'bounced'`

`exclusion_lists` stays as the company-level list.

## 3. Consent at signup

```sql
consent_wordings (version text pk, purpose text, channel text, text text not null, effective_at timestamptz)

consent_records (            -- append-only; current state = latest row per (subject, purpose)
  id uuid pk, captured_at timestamptz not null default now(),   -- server time, set in the trigger
  profile_id uuid null, prospect_id uuid null, email_normalized text not null,
  channel text check (channel in ('email','sms')),
  purpose text check (purpose in ('marketing','job_alerts','product_updates')),
  granted boolean not null,
  wording_version text not null references consent_wordings(version),
  source text not null,      -- 'signup_form','profile_settings','partner_form','unsubscribe'
  landing_path text, utm_source text, utm_campaign text
)
```

**Files that change:**
- **`src/views/Register.vue`:** split the required box into a required "Terms and account emails" box (transactional mail needs no consent) and an optional, unticked "marketing emails" box. SMS stays its own box.
- **`src/lib/auth.ts`:** pass `marketing_email_consent`, `sms_consent` and `consent_wording_version` in the signup metadata.
- **`handle_new_user()`:** insert the `consent_records` rows.
- **`Profile.vue` / `notifications.ts`:** add a marketing toggle; each change appends a row.
- **`unsubscribe-email`:** append a `granted = false` row.
- **`admin-revenue-recovery-segments`:** gate on the current marketing consent.

## Consent: pending approval

Built in step 4 (migration `20261121120000_consent_records`). The new wordings below are drafts that need approval before deploy. Each text lives in two places and must stay identical: `src/lib/consent.ts` / `src/views/Register.vue`, and the `consent_wordings` seed.

**Terms box** (required, `Register.vue`; transactional, so not stored as consent):

> I agree to the Terms & Conditions and Privacy Policy, and to receive emails about my account, such as sign-in, billing and the job alerts I set up.

"Terms & Conditions" links to `/terms` and "Privacy Policy" to `/privacy`.

**Marketing opt-in** (optional, unticked; `marketing_email_v1`, the only version in `accepted_marketing_wordings`):

> Send me job search tips, product news and offers by email. Optional. Unsubscribe anytime.

**Legacy wordings** (recorded by the backfill, `source = 'backfill_legacy_signup_approx'`; neither counts as marketing consent):

| Version | Signups created | Exact text |
|---|---|---|
| none | before 2026-03-05 | No checkbox existed; no row |
| `legacy_bundled_v0_mar2026` | 2026-03-05 to 2026-07-28 | "I agree to receive emails from Job-Hopper about my account and services, including product updates and general marketing emails. You can change your email preferences or unsubscribe at any time from your settings or from any email we send." |
| `legacy_bundled_v0` | 2026-07-29 onward | "I agree to receive account and marketing emails from Job-Hopper. Unsubscribe anytime." |

The cutoffs are the commit dates of `30faa32` and `4dc0d68` (UTC midnight), not deploy dates, so signups near a cutoff may be in the wrong band. Counting either legacy wording as consent later is one insert into `accepted_marketing_wordings`.

**System announcements** don't check marketing consent. They rely on the per-category announcements opt-in (`notification_settings.system_announcements_email_enabled`) plus suppression. Only revenue-recovery real sends are gated on `current_marketing_consent()`.

## 4. Per-send log

Widen `email_events` rather than adding a separate `outbound_sends` table. It already has a nullable `profile_id`, `type`, `template_key`, `provider_message_id`, `status` and `error_message`. One log for all mail also lets the bounce webhook update any send by message id.

**New columns and index:**
- `prospect_id`, `institutional_lead_id`, `to_email_normalized`, `campaign`, `sequence_stage`
- `delivered_at`, `bounced_at`, `complained_at`
- index on `provider_message_id`

**New enum values**, each in its own migration file (`ADD VALUE` can't share a transaction):
- `email_event_type` + `outbound`
- `email_event_status` + `delivered`, `bounced`, `complained`

**Files that change:**
- `outbound-live-send.mjs`: one row per send, success or failure. The `institutional_leads` last-send columns stay as a cache.
- `mailtrap-bounce-webhook`: update by `message_id`.
- `admin-growth-dashboard`: count delivered and bounced sends by campaign.

`outbound_dry_run_log` stays as it is.

## 5. Unsubscribe fixes

**Token v2** (`_shared/unsubscribe-token.ts`):
- Payload becomes `{ v: 2, email_normalized, profile_id?, prospect_id?, scope, exp }`, so outbound prospects with no profile can unsubscribe too.
- `unsubscribe-email` keeps accepting v1 tokens until the old links expire.

**GET confirms, POST acts** (`unsubscribe-email/index.ts`):
- GET only redirects to a new SPA page, `/unsubscribe?token=…`, which shows a confirm button.
- POST does the unsubscribe. It accepts the token from the query string with body `List-Unsubscribe=One-Click` (inbox one-click unsubscribe, RFC 8058) or from a JSON body sent by the confirm page.
- `verify_jwt = false` is already set in `supabase/config.toml`.
- The new page is a public route in `src/router/index.ts`; its API call goes in `src/lib/`.

**Headers** (`email-provider.ts`):
- `SendEmailParams` gets `headers?`, passed through in the Mailtrap payload.
- `sendEmail` adds `List-Unsubscribe: <https://…/unsubscribe-email?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on marketing sends.
- `outbound-live-send.mjs`: the same headers in `sendEmailViaMailtrap`.

**No silent fallback:**
- `getFooterLinksForProfile` throws when the secret or URL is missing, instead of falling back to `/profile?unsubscribe=1`.
- `sendEmail` refuses a marketing send without a valid unsubscribe URL.
- Transactional sends still go out with the preferences link only.

**Outbound templates** (`scripts/outbound-dry-run.mjs`): every template gets a footer with an unsubscribe link (a v2 token per recipient) and the postal address, rendered in both the preview and the live send.

## Build order

1. **`suppressed_emails`, `is_email_suppressed()` and the backfill.** Wire the check into `sendEmail` and `outbound-live-send.mjs`. *(in progress)*
2. **Unsubscribe fixes plus suppression writers:** token v2, POST + confirm page, headers, fail-closed footer links, template footers, then the webhook spam/unsubscribe events and the `classify-replies` email suppression.
3. **The `email_events` extension** (enum migrations first), then the outbound and webhook writes.
4. **Consent:** `consent_wordings`, `consent_records`, the signup split, the trigger and the profile toggle.
5. **`prospects` and `prospect_evidence`:** the eligibility view, the `handle_new_user` link, `lead_scores.prospect_id`, `reply_events.prospect_id`.
6. **Later:** backfill institutional `contact_email` into prospect rows of kind `institution_contact`.

The B2C prospects come last on purpose: no cold B2C send should be possible until steps 1–4 exist.

## Decisions needed

| # | Decision | Default proposed | Who |
|---|---|---|---|
| 1 | Legal basis for cold email to individual job seekers. US CAN-SPAM allows opt-out-based mail; the EU/UK (GDPR, PECR) and Canada (CASL) generally need prior consent for individuals. Sets which `consent_status` values and countries allow a send. Prospect sourcing (scraped public posts, Apollo) also needs checking against those sites' and Apollo's terms. | US-only until decided | |
| 2 | Postal address for the footer: registered office, or a PO box / virtual mailbox | — | |
| 3 | Sending setup: cold-mail subdomain; a monitored From mailbox instead of `no-reply@`; Mailtrap's bulk stream or another provider; Mailtrap's acceptable-use policy on cold B2C email | — | |
| 4 | Does a marketing unsubscribe also stop job-match digests and Sponsor Watch? | Marketing only; "unsubscribe all" in the profile stops everything except billing | |
| 5 | Does the old bundled signup checkbox count as marketing opt-in for existing users? Decides whether revenue-recovery emails can go to them. | — | |
| 6 | Store IP and user agent on consent records? Stronger proof of consent, but more personal data kept. | — | |
| 7 | Unsubscribe token expiry: keep 1 year, or never expire? | — | |
| 8 | When the suppression check itself fails | Block marketing, allow transactional *(built this way in step 1)* | |

**To verify before step 2 (not decisions):**
- Mailtrap's send API accepts custom headers.
- The exact Mailtrap webhook event names for spam and unsubscribe.
- Whether Supabase's default domain serves `text/html` from edge functions. That's why the confirm page lives in the SPA.
