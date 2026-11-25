# Deploying growth/day7-recovery

Branch `growth/day7-recovery`. Two parts: 7b (checkout tracking and cancellation data) and
7c (recovery sequences). Nothing here is deployed yet.

## Order

1. **Migrations**, in this order (`supabase db push` applies them in order; check the
   dry run lists exactly these):
   - `20261123120000_subscription_cancellation.sql`
   - `20261124120000_email_event_type_recovery.sql` (its own file: a new enum value
     can't be used in the transaction that adds it)
   - `20261124120100_recovery_sequences.sql`
2. **Stripe dashboard**: subscribe the webhook endpoint to `checkout.session.expired`.
   Without it, abandoned checkouts are only ever `started`, never `expired`. The
   abandoned-checkout segment still works (it uses `started` or `expired` rows over an
   hour old), but `expired` is the confirmation that Stripe gave up on the session.
3. **Edge functions**, after the migrations (each one reads new columns or functions):
   - `stripe-webhook` writes the cancellation columns and `checkout_attempts`.
     Deployed before the migration, every subscription update fails and Stripe retries
     it for days, status included.
   - `create-checkout-session` writes `checkout_attempts` (best effort).
   - `admin-growth-dashboard` calls `cancellation_dashboard_counts()` and
     `recovery_funnel_counts()`.
   - `recovery-sequences` (new): the daily recovery run.
   - `admin-revenue-recovery-segments`: preview, manual send, test send.
   - `run-scheduled-jobs` **last**: its watchdog now re-seeds the `recovery-sequences`
     chain, so `recovery-sequences` must exist first. The first watchdog pass starts the
     daily chain; no manual seed needed.
4. **Frontend** (Netlify): the admin growth dashboard and `/admin/revenue-recovery`.
5. `npm run db:types` against hosted and commit `src/types/supabase.ts`.

## After deploy

- `growth_settings.recovery_auto_send` is **false**: the daily run only logs a preview
  (counts per segment, nothing sent, nothing written to `followup_sequences`). Check the
  `[recovery-sequences] preview` log line and the preview on `/admin/revenue-recovery`.
- Stage 2 copy for every segment is a draft pending approval
  (`_shared/revenue-recovery-copy.ts`). Approve it before turning auto-send on or sending
  a batch that includes stage-2 emails.
- To turn on daily sending, after approval:
  `update public.growth_settings set recovery_auto_send = true where id = 1;`
  The per-run cap is `recovery_max_sends_per_run` (default 25).
- Offers stay out of every email unless added to `growth_settings.recovery_offers`, e.g.
  `update public.growth_settings set recovery_offers = '{"cancelled": "..."}' where id = 1;`

## Known limits

- Existing canceled subscriptions have no `canceled_at` or reason: nothing stored
  locally has them; getting them means reading each subscription from Stripe.
- The 7-day limit applies across all recovery sequences, so stage 2 goes out 7 days
  after stage 1 at the earliest, not 5.
- `high_match_users` is disabled while the job feed is stale (no new jobs since
  2026-11-12).
