# Revenue automation schema (Week 1: data foundation)

Sprint context: a new revenue-automation initiative, separate from the product plan.
RingCentral access isn't available yet, so call ingestion is on hold — this is schema
only, no automation logic, scoring calculations, or email sending.

## Audit findings (checked against actual schema/code, not assumed)

- **Checkout-start events: don't exist.** `stripe-webhook` only handles
  `checkout.session.completed` / `customer.subscription.updated` /
  `customer.subscription.deleted` — no `checkout.session.expired` handler, and nothing
  client-side fires when a user opens Stripe Checkout. This is already called out in
  `supabase/functions/_shared/revenue-recovery-segments.ts` as a segment the team
  deliberately did *not* build because the signal doesn't exist. **Abandoned-checkout
  recovery cannot work without new instrumentation** (either a `checkout.session.expired`
  webhook handler, or a client-side "checkout started" event before redirecting to
  Stripe). **Update 2026-09-06: closed.** See `checkout_attempts` below — both halves
  (client-side start event, `checkout.session.expired` backstop) are now built and
  verified against real Stripe test-mode events.
- **Product-intent signals are limited to cumulative counters.** `freemium_usage` has
  `job_searches_used` / `resume_advice_used` / `premium_insights_used` (integers) and
  `selected_tier_key` — no timestamps of individual events, no record of *when* a limit
  was hit, no tracking of repeated searches beyond the running total, and no visit
  tracking for `/pricing` or in-app upgrade prompts. `log-seo-page-view` exists but is
  scoped to `seo_pages` rows (marketing landing pages) and no-ops for anything else —
  it is not wired to `Pricing.vue` or any upgrade CTA. **Product-intent triggers beyond
  "hit the free-tier cap" (which is already usable — see
  `isHeavyFreeUsage` in `revenue-recovery-segments.ts`) need new event-level
  instrumentation**, not just new tables.
- **Reusable today:** `subscriptions.status` transitions (current status only, no
  history — "trial expired vs. briefly-active-then-canceled" is indistinguishable per the
  same file's comments), `profiles` attribution fields (`utm_source`, `utm_campaign`,
  `utm_medium`, `landing_path`, `referrer_host`, `referred_by_institutional_lead_id` —
  all first-touch-only, written once by `handle_new_user()`, never updated), and
  `institutional_leads` (B2B pipeline: universities/employers/career partners/workforce
  orgs, RLS enabled with no policies, service-role writes only, upserted on
  `(organization_name, source)`).
- **`institutional_leads` itself has no `CREATE TABLE` in migration history** — it
  predates the tracked migrations (likely created directly against the DB). Not a
  blocker, just worth knowing if you're looking for its origin.
- **No standalone outbound-email table.** Outbound sends are tracked as columns
  directly on `institutional_leads` (`provider_message_id`, `last_send_error`,
  `last_send_attempted_at`), not as one row per send. The only real per-email row with
  an `id` is `reply_events` (inbound replies to outbound leads). `objections.email_id`
  below points at `reply_events`, not a nonexistent "emails" table.
- **Existing patterns followed:** upsert-on-conflict for idempotent writes
  (`submit-partner-lead` → `institutional_leads`), RLS enabled + no
  policy for authenticated/anon on sales-pipeline-shaped tables (service-role-only
  writes: `institutional_leads`, `reply_events`, `profile_roles`), and
  `current_user_has_role('admin' | 'super_admin')` for admin-gated read access
  (`freemium_settings`, `admin-institutional-leads`).

**Bottom line for Week 2 automations:** lead scoring, objection tracking, and follow-up
sequencing can be built on the tables below as soon as calls start getting logged
(manually, until RingCentral is wired). Abandoned-checkout recovery and richer
product-intent triggers cannot start on real signal yet — they need new
instrumentation (a checkout-start event, and event-level product-intent logging) that
doesn't exist in the codebase today. Don't build automations against those until that
lands.

## Tables

All five: RLS enabled, `admin`/`super_admin` can `SELECT` via `current_user_has_role()`,
no `INSERT`/`UPDATE`/`DELETE` policy for `authenticated` — writes are service-role only
(same convention as `institutional_leads`/`reply_events`/`profile_roles`).

A "lead" in this system can be either an existing app user (`profiles`) or a
not-yet-signed-up B2B contact (`institutional_leads`) — both are real call targets
(upgrade-recovery calls to users, sales calls to institutional leads). Tables that
reference "the lead" carry both FKs, nullable, with a check constraint requiring at
least one.

- **`calls`** — one row per call (manually logged today; RingCentral fields are
  nullable placeholders for when access lands). Links to `profiles` and/or
  `institutional_leads`.
- **`call_extractions`** — one row per call (`call_id` unique), structured extraction of
  what happened on the call: pain point, target role, sponsorship context, buying
  intent, objection, timing, promised follow-up, recommended next action, and a
  `confidence_score` (0–1) for how much to trust the extraction.
- **`lead_scores`** — append-only log (one row per computation, not a mutable score) of
  an intent score (0–100) plus `scoring_factors` (jsonb) and a plain-text
  `explanation`, so a score is always explainable from its own row rather than a
  black-box model output.
- **`objections`** — one row per objection raised, sourced from a call
  (`call_id`) or an inbound reply (`email_id`, references `reply_events` — see audit
  note above on why there's no separate emails table). `category` is a fixed check
  constraint list; `source`/`notes` are free text.
- **`followup_sequences`** — one row per scheduled follow-up touch in a sequence, with
  `sent_date` set once actually sent and `stop_reason` set when a sequence ends early
  (reply, subscribed, unsubscribed, or a manual pause).

## checkout_attempts (added 2026-09-06, closes the checkout-start gap above)

- **`checkout_attempts`** — one row per Stripe Checkout session: `profile_id`,
  `stripe_checkout_session_id` (unique), `status` (`started` → `completed` | `expired`),
  `created_at`, `completed_at`. Written by `create-checkout-session` right after the
  Stripe session is created (primary, same-day signal). Closed out by `stripe-webhook`:
  `checkout.session.completed` upserts it to `completed` (this also backfills a row from
  webhook data if the client-side write never fired — ad blocker, tab closed before
  redirect), and the new `checkout.session.expired` handler flips `started` → `expired`
  as an authoritative backstop (~24h later, per Stripe's own expiry window). Same
  upsert-on-conflict write pattern as `institutional_leads`/`freemium_usage`; same
  admin-read/service-write RLS as the other tables in this doc.
- **Abandoned-checkout query** (used for the "abandoned in the last N days" check, not
  yet wired to any automation):
  ```sql
  select id, profile_id, stripe_checkout_session_id, created_at
  from public.checkout_attempts
  where status = 'started'
    and completed_at is null
    and created_at < now() - interval '2 hours'
    and created_at >= now() - interval '7 days';
  ```
  Verified against a real local Stripe test-mode Checkout Session left uncompleted, and
  against a synthetic 5-hours-old row — the query correctly excludes a session under 2
  hours old and correctly returns one that's past the window.
- **Manual step required, not code**: the Stripe webhook endpoint (dashboard or
  `stripe listen` in dev) must be subscribed to `checkout.session.expired` for Part 2 to
  ever fire in the deployed app — Stripe only sends events an endpoint is subscribed to.
  Same category of manual setup as the `run-scheduled-jobs` pg_cron job.
- Verified end-to-end locally: `checkout.session.completed`'s upsert and the new
  `checkout.session.expired` handler were both exercised against real Stripe test-mode
  events (via `stripe listen` + `stripe checkout sessions expire`), landing correctly in
  local `checkout_attempts` rows.

### Dual webhook secret (live + sandbox), added 2026-09-06

`stripe-webhook` now verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`
(live) first, and only falls back to `STRIPE_WEBHOOK_SECRET_TEST` (optional; a Stripe
sandbox/test-mode destination's signing secret) if the live check fails. Rejects only
if neither matches. `STRIPE_WEBHOOK_SECRET` is never read differently or rotated by
this change — an unset `STRIPE_WEBHOOK_SECRET_TEST` (the deployed default until someone
sets it) means zero behavior change from before. Set it with:

```
supabase secrets set STRIPE_WEBHOOK_SECRET_TEST=whsec_xxxxx --project-ref imekpzzvylngpoagcdow
```

then `supabase functions deploy stripe-webhook --project-ref imekpzzvylngpoagcdow` to
pick up the new code path (secrets apply to already-deployed functions on their next
cold start, but deploy anyway since the code itself changed here too).

## Not built yet (explicitly out of scope for this pass)

- No automation logic (scheduling, sending) — schema only. Nothing reads
  `checkout_attempts` for a real recovery send yet either — the query above is proven
  correct, not wired to anything.
- No scoring calculation — `lead_scores` is a place to write scores, not a scorer.
- Product-intent instrumentation beyond the free-tier-cap signal (pricing-page visits,
  repeated-search tracking) is still missing — checkout-start is closed, that one isn't.
- `src/types/supabase.ts` was not regenerated (needs `npm run db:types` against the
  live schema after this migration is applied) — do that before writing any frontend
  or edge-function code against these tables, per the repo's generated-types convention.
