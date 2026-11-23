# Day 7 recovery sequences: demo and hosted numbers

Run on 2026-11-23, branch `growth/day7-recovery`. Hosted got the three day-7
migrations only (no functions deployed). The demo ran against the local Supabase only,
with `EMAIL_PROVIDER=log` so no email reached Mailtrap.

## Hosted (read-only, after the migration push)

Pushed `20261123120000_subscription_cancellation`, `20261124120000_email_event_type_recovery`
and `20261124120100_recovery_sequences` (the dry run listed exactly these three). No leftover
`cli_login` sessions afterwards. `growth_settings.recovery_auto_send = false`, 25 sends per
run, no offers.

`recovery_candidates()`: **268 people**, one segment each after the priority rule:

| Segment | People | Marketing consent now | Consent if both legacy wordings were accepted |
|---|---:|---:|---:|
| Abandoned checkout | 24 | 0 | 24 |
| Cancelled | 28 | 0 | 28 |
| Heavy free usage | 8 | 0 | 8 |
| Visa/sponsorship-focused | 49 | 0 | 49 |
| Activated, never paid | 37 | 0 | 37 |
| Onboarded, no resume | 0 | 0 | 0 |
| Signed up, never activated | 122 | 0 | 122 |
| Not seen in 30+ days | 0 | 0 | 0 |

- **Nobody can be emailed today.** `accepted_marketing_wordings` only holds
  `marketing_email_v1`, the new signup checkbox, which isn't deployed yet. Every
  candidate's latest marketing record is a legacy bundled grant: 204
  `legacy_bundled_v0_mar2026`, 64 `legacy_bundled_v0`. The last column counts them as if
  both were accepted; that was computed in the query, and `accepted_marketing_wordings`
  is unchanged.
- **Two segments can never fire with the current priority order.** Subscription status
  is only `trial`, `active`, `canceled` or `past_due`. Trial and active are live access,
  past_due is excluded and canceled goes to Cancelled. So an onboarded candidate always
  has no subscription row, and lands in "Activated, never paid" first. "Onboarded, no
  resume" needs an onboarded person who isn't in that segment, which can't happen. "Not
  seen in 30+ days" is the same for onboarded people. Non-onboarded people go to "Never
  activated" once they're 3 days old, and nobody under 3 days old can be 30 days unseen.
  Before priority they'd hold 10 and 231 people respectively (94 match "activated, never
  paid" before priority).

## Local demo

### Setup

1. Local migrations applied (`supabase migration up --local --include-all`), including
   `20261119120000`, which the local DB didn't have yet.
2. Functions served with an env file holding only `EMAIL_PROVIDER=log`, a throwaway
   `UNSUBSCRIBE_EMAIL_SECRET` and `SITE_URL=http://localhost:5173`:
   `supabase functions serve --env-file <file>`. In log mode the provider returns before
   any Mailtrap call, logs `to`, `subject` and `campaign`, and uses a `log-` message id.
3. Demo admin `d09@example.test` created through the local auth API (it needs a
   password), then `supabase/scripts/recovery_demo_seed.sql`:

| User | Set up as | Result |
|---|---|---|
| d01 | started checkout 2h ago | Abandoned checkout |
| d02 | canceled subscription | Cancelled |
| d03 | 3/3 free searches | Heavy free usage |
| d04 | needs sponsorship | Visa |
| d05 | onboarded, resume, no subscription | Activated, never paid |
| d06 | onboarded, no resume | Activated, never paid (see above) |
| d07 | not onboarded, 5 days old | Never activated |
| d08 | onboarded, last seen 40 days ago | Activated, never paid (see above) |
| d09 | admin | excluded |
| d10 | partner staff | excluded |
| d11 | active subscription | excluded |
| d12 | past_due | excluded |
| d13 | activated, never paid, no marketing consent | candidate, never emailed |

All but d13 got a `marketing_email_v1` consent grant. The local DB also has 42 older dev
users, none with consent.

### 1. Preview (admin page action, auto-send off)

```
mode preview | autoSend False | candidates 51
people / due by segment: activated_never_paid 29/3, cancelled 1/1, visa_focused_no_conversion 14/1,
  never_activated 5/1, abandoned_checkout 1/1, heavy_free_usage 1/1
skipped: {'no_consent': 43}
   d***@example.test abandoned_checkout stage 1 recovery_abandoned_checkout_s1
   d***@example.test cancelled stage 1 recovery_cancelled_s1
   d***@example.test heavy_free_usage stage 1 recovery_heavy_free_usage_s1
   d***@example.test visa_focused_no_conversion stage 1 recovery_visa_focused_no_conversion_s1
   d***@example.test activated_never_paid stage 1 recovery_activated_never_paid_s1   (x3)
   d***@example.test never_activated stage 1 recovery_never_activated_s1
```

51 candidates = 42 dev users + d01–d08 + d13. The four excluded users aren't candidates.
The 43 skipped for no consent = 42 dev users + d13.

The first preview run listed all 51, because consent was only checked at send time. The
preview now runs the same read-only pre-send check as a send, so it only lists people who
would actually get an email.

### 2. Daily job with auto-send off

`recovery-sequences` (service-role call, as `run-scheduled-jobs` makes it) returned
`mode: preview`, `sent: 0`. It logged `[recovery-sequences] preview` with counts only,
wrote no `followup_sequences` or `email_events` rows, and enqueued its next run for the
next day (`scheduled_jobs`, pending).

### 3. Auto-send on, send a batch

`update growth_settings set recovery_auto_send = true` (local), then the daily job:
`mode: send, sent: 8, failed: 0, skipped: {no_consent: 43}`. Log provider output:

```
d01  You started checking out on Job-Hopper                              recovery_abandoned_checkout_s1
d02  Your Job-Hopper subscription is still available if you want it back recovery_cancelled_s1
d03  You've used your free searches -- Core removes that cap             recovery_heavy_free_usage_s1
d04  Real sponsorship data for your job search                           recovery_visa_focused_no_conversion_s1
d05  What Core unlocks beyond your free searches                         recovery_activated_never_paid_s1
d06  What Core unlocks beyond your free searches                         recovery_activated_never_paid_s1
d08  What Core unlocks beyond your free searches                         recovery_activated_never_paid_s1
d07  Finish setting up your Job-Hopper account                           recovery_never_activated_s1
```

Each got an `email_events` row (`type recovery`, its campaign, `sequence_stage 1`, status
`sent`, `log-` message id) and a `followup_sequences` stage-1 row with `sent_date` and
`email_event_id` set.

Running the job again immediately: `sent: 0, skipped: {rate_limited_7d: 8}`.

### 4. Seven days later: stage 2

Stage-1 `sent_date` / `sent_at` shifted back 7 days for d01, d03–d06 and d08, then the job:
`sent: 6, skipped: {rate_limited_7d: 2}` (d02 and d07, not shifted yet).

```
d01  Any questions about Job-Hopper plans?                       recovery_abandoned_checkout_s2
d03  Keep your job search going without the free-plan cap        recovery_heavy_free_usage_s2
d04  Know which employers sponsor before you apply               recovery_visa_focused_no_conversion_s2
d05  Is the free plan enough for your search?                    recovery_activated_never_paid_s2
d06  Is the free plan enough for your search?                    recovery_activated_never_paid_s2
d08  Is the free plan enough for your search?                    recovery_activated_never_paid_s2
```

### 5. One pays, one unsubscribes, before their stage 2

d02 got an active subscription and a completed checkout; d07 got
`notification_settings.email_unsubscribed_at`. Their stage 1 was shifted back 7 days,
then the job: `sent: 0, stopped: {paid: 1, unsubscribed: 1}`.

```
 d01 | recovery_abandoned_checkout         | 1 | 2026-11-16 |
 d01 | recovery_abandoned_checkout         | 2 | 2026-11-23 |
 d02 | recovery_cancelled                  | 1 | 2026-11-16 | paid
 d03 | recovery_heavy_free_usage           | 1 | 2026-11-16 |
 d03 | recovery_heavy_free_usage           | 2 | 2026-11-23 |
 d04 | recovery_visa_focused_no_conversion | 1 | 2026-11-16 |
 d04 | recovery_visa_focused_no_conversion | 2 | 2026-11-23 |
 d05 | recovery_activated_never_paid       | 1 | 2026-11-16 |
 d05 | recovery_activated_never_paid       | 2 | 2026-11-23 |
 d06 | recovery_activated_never_paid       | 1 | 2026-11-16 |
 d06 | recovery_activated_never_paid       | 2 | 2026-11-23 |
 d07 | recovery_never_activated            | 1 | 2026-11-16 | unsubscribed
 d08 | recovery_activated_never_paid       | 1 | 2026-11-16 |
 d08 | recovery_activated_never_paid       | 2 | 2026-11-23 |
```

d02 is no longer a candidate once it has live access, so the start-of-run sweep over
open sequences stopped it. d07 was still a candidate; its stage 2 was blocked by the
check right before the send.

### 6. Recovery funnel (`admin-growth-dashboard`, as d09)

Before reading it, demo users' `last_active_at` was set to before their first send, then
d01 and d02 were marked active now (the seed's "2 days ago" would otherwise have counted
everyone as coming back after the shifted sends).

| Segment | Sent | Delivered | Came back | Paid in 30 days |
|---|---:|---:|---:|---:|
| Abandoned checkout | 1 | 0 | 1 | 0 |
| Cancelled | 1 | 0 | 1 | 1 |
| Heavy free usage | 1 | 0 | 0 | 0 |
| Visa/sponsorship-focused | 1 | 0 | 0 | 0 |
| Activated, never paid | 3 | 0 | 0 | 0 |
| Onboarded, no resume | 0 | 0 | 0 | 0 |
| Signed up, never activated | 1 | 0 | 0 | 0 |
| Not seen in 30+ days | 0 | 0 | 0 | 0 |

People per segment from their first send. Delivered is 0 because log mode gets no
Mailtrap delivery webhook.

### 7. Cleanup

`supabase/scripts/recovery_demo_cleanup.sql` removed the demo users and everything they
created (followups, email events, consent rows, suppressions, partner staff, demo lead,
the queued `recovery-sequences` run) and set `recovery_auto_send` back to false. Checked
afterwards: 0 `@example.test` users, 0 followup rows, 0 recovery email events.

## Re-running the demo

1. `supabase migration up --local --include-all`
2. An env file with `EMAIL_PROVIDER=log`, `UNSUBSCRIBE_EMAIL_SECRET=<anything>`,
   `SITE_URL=http://localhost:5173`; `supabase functions serve --env-file <file>`
3. Create `d09@example.test` with a password through `POST /auth/v1/admin/users` (local
   service-role key, id `00000000-0000-4000-8000-000000000709`), then run
   `supabase/scripts/recovery_demo_seed.sql`
4. Call `admin-revenue-recovery-segments` `{"action":"preview"}` as d09, and
   `recovery-sequences` with the local service-role key; shift timestamps as above
5. `supabase/scripts/recovery_demo_cleanup.sql`
