# Day 5 outreach sequences: local demo

Run on 2026-11-24/25 on branch `growth/day5-replies`, against the **local** Supabase only,
with `EMAIL_PROVIDER=log` (no email reached Mailtrap). Nothing was deployed.

## What's being shown

4-stage outreach (day 0, 2, 4, 6; sequence key `outreach_<campaign>`) to institutional
leads and job-seeker prospects. `scripts/outbound-live-send.mjs` enrolls, the
`outreach-sequences` function sends (`_shared/outreach-sequences.ts`). Before every send
the person is re-checked: a reply since the sequence started, unsubscribe/suppression,
bounce, complaint, sign-up, payment, and exclusion_lists (leads) or
prospect_send_eligibility (prospects). One outreach email per person per 2 days, none
within 2 days of a recovery email, and a missed run sends only the next stage.

## Setup

1. `supabase migration up --local` (applied `20261124130000_reply_handling` and
   `20261124140000_outreach_sequences`).
2. `supabase functions serve --env-file <file>` with only `EMAIL_PROVIDER=log`, a
   throwaway `UNSUBSCRIBE_EMAIL_SECRET`, `SITE_URL=http://localhost:5173`,
   `OUTBOUND_POSTAL_ADDRESS=1 Demo Street, Austin, TX 78701`, `SENDER_NAME=Sam at Job-Hopper`.
3. `supabase/scripts/outreach_demo_seed.sql`: two leads and three prospects, all
   `@example.test`:

| Person | Role in the demo |
|---|---|
| l1-dean (Demo Outreach University) | replies after stage 2 |
| p1-seeker (Maria, UX Designer) | unsubscribes after stage 2 |
| l2-dean (Demo Second College), p2-seeker (Dev, Data Analyst) | the two-runs-at-once check |
| p3-seeker (Ana, no target role) | its runs are skipped for 4 days |

Time is simulated by moving one person's sequence timestamps (scheduled, created, sent,
claimed) and their `email_events.sent_at` into the past.

## 1. Enroll (the real script)

```
node scripts/outbound-live-send.mjs --preview --prospects --campaign=demo-day5 --only="<the 5 people>"
```

The preview rendered each stage-1 email with its footer and wrote nothing:

```
[university] Demo Outreach University <l1-dean@example.test>
From: Job-Hopper University Partnerships  Reply-To: university-partnerships@job-hopper.co
Subject: Job-Hopper for Demo Outreach University career services
Hi Pat,
... (the existing reviewed stage-1 template) ...
More info: https://job-hopper.io/universities?utm_source=email_outbound&utm_campaign=outreach_demo-day5_s1&utm_medium=email

Sam at Job-Hopper
Job-Hopper

--
Job-Hopper, 1 Demo Street, Austin, TX 78701
Don't want emails like this? Unsubscribe: http://127.0.0.1:54431/functions/v1/unsubscribe-email?token=...
[prospect] p1-seeker@example.test  (DRAFT copy)
...
Preview complete: would enroll 2 lead(s) and 3 prospect(s); 0 lead(s) skipped.
```

Without `--preview`: `Enrolled 2 lead(s) and 3 prospect(s) in outreach_demo-day5; stage 1
is due now.` Five stage-1 rows, due now, nothing claimed or sent.

## 2. Day 0: stage 1

With `outreach_auto_send` off the daily job only previewed:
`{"mode":"preview","sequences":5,"sent":0}`; 0 rows claimed or sent.

Turned on locally, the job sent stage 1 to all five
(`{"mode":"send","sequences":5,"sent":5}`), logged by the log provider:

```
p3-seeker  "Your job search"                                        outreach_demo-day5_s1  replyTo partnerships@job-hopper.co
p2-seeker  "Your Data Analyst search"                               outreach_demo-day5_s1  replyTo partnerships@job-hopper.co
l1-dean    "Job-Hopper for Demo Outreach University career services" outreach_demo-day5_s1  replyTo university-partnerships@job-hopper.co
p1-seeker  "Your UX Designer search"                                outreach_demo-day5_s1  replyTo partnerships@job-hopper.co
l2-dean    "Job-Hopper for Demo Second College career services"     outreach_demo-day5_s1  replyTo university-partnerships@job-hopper.co
```

Each got an `email_events` row (type `outbound`, its stage campaign, `sequence_stage`,
`log-` message id, linked from the sequence row) and a stage-2 row scheduled 2 days
later. Leads and prospects moved from `new` to `contacted`.

## 3. Day 2: stage 2

Two days passed for l1, l2, p1, p2 (not p3):
`{"sent":4,"skipped":{"not_due":1}}`, stage 2 to those four:

```
p1-seeker  "Less time searching job boards"                               outreach_demo-day5_s2
p2-seeker  "Less time searching job boards"                               outreach_demo-day5_s2
l1-dean    "Re: Job-Hopper for Demo Outreach University career services"   outreach_demo-day5_s2
l2-dean    "Re: Job-Hopper for Demo Second College career services"        outreach_demo-day5_s2
```

## 4. A reply and an unsubscribe

- l1 replied through the real `reply-ingest` function:
  `{"duplicate":false,"matchedLeadId":"3336d525-..."}`.
- p1 unsubscribed through the real one-click flow: a POST to `unsubscribe-email` with the
  footer's signed token and body `List-Unsubscribe=One-Click` returned
  `{"ok":true,"email":"p1-seeker@example.test","scope":"marketing"}` (HTTP 200), which
  wrote `suppressed_emails: p1-seeker@example.test unsubscribe marketing via unsubscribe-email`.

## 5. Day 4: both stop; two runs at once send each email once

Two more days for l1, l2, p1, p2, then two requests to `outreach-sequences` at the same
moment:

```
run A: {"sent":2,"skipped":{"not_due":1},"stopped":{"unsubscribed":1,"reply":1}}
run B: {"sent":0,"skipped":{"not_due":3,"stopped":2}}
```

Stage 3 went to l2 and p2 once each; l1 stopped with `reply` and p1 with `unsubscribed`
before stage 3. Running again immediately sent nothing. The local edge runtime handled
those two requests one after the other (run B already saw the stage-4 rows run A
created), so this showed no duplicates but not a true race; the race is in step 7.

```
 l1-dean   | 1 | sent 11-20 | reply
 l1-dean   | 2 | sent 11-22 | reply
 l1-dean   | 3 | -          | reply
 p1-seeker | 1 | sent 11-20 | unsubscribed
 p1-seeker | 2 | sent 11-22 | unsubscribed
 p1-seeker | 3 | -          | unsubscribed
 l2-dean   | 3 | sent 11-24 |            (stage 4 scheduled 11-26)
 p2-seeker | 3 | sent 11-24 |            (stage 4 scheduled 11-26)
```

## 6. A skipped run catches up with one email, not two

p3's timeline moved 4 days back, so its stage 2 (day 2) and stage 3 (day 4) were both
overdue. The run sent only stage 2: `{"sent":1}`, `p3-seeker outreach_demo-day5_s2`. The
next run sent nothing (`"rate_limited_2d":1`); stage 3 waits for the 2-day gap.

```
 stage | due         | sent
     1 | 11-20 19:06 | 11-20 19:07
     2 | 11-22 19:07 | 11-24 19:08
     3 | 11-24 19:07 |
```

## 7. A real race: two runner processes in parallel

l2 and p2 were moved 2 days on (stage 4 due), then two separate Deno processes ran the
real runner (`createOutreachDeps` + `runOutreach`, log provider, local DB) at the same
time:

```
run B: {"sent":1,"skipped":{"stopped":2,"rate_limited_2d":2},"sentTo":["l***@example.test s4"]}
run A: {"sent":1,"skipped":{"stopped":2,"rate_limited_2d":1,"already_claimed":1},"sentTo":["p***@example.test s4"]}
```

Run A lost l2's stage-4 row at the claim (`already_claimed`); run B found p2 already
emailed (`rate_limited_2d`). The send log has exactly one stage-4 email for each:

```
 l2-dean   | outreach_demo-day5_s1..s4 | 4 rows, one per stage | outreach_university_s1..s4
 p2-seeker | outreach_demo-day5_s1..s4 | 4 rows, one per stage | outreach_prospect_s1..s4
 l1-dean, p1-seeker | s1, s2 only
 p3-seeker | s1, s2 only
```

## 8. Admin view

`admin-revenue-recovery-segments` `{"action":"outreach"}` as a temporary local admin
(deleted afterwards), as shown on `/admin/revenue-recovery`:

```
settings {'autoSend': True, 'maxPerRun': 25}
  prospect Ana                       p***@example.test  sent 2/4  active   next s3 due 2026-11-24T19:07
  lead     Demo Second College       l***@example.test  sent 4/4  complete
  prospect Dev                       p***@example.test  sent 4/4  complete
  prospect Maria                     p***@example.test  sent 2/4  stopped  unsubscribed
  lead     Demo Outreach University  l***@example.test  sent 2/4  stopped  reply
```

## 9. Cleanup

`supabase/scripts/outreach_demo_cleanup.sql` removed the demo leads, prospects, sequence
rows, email events, reply, suppression, the queued `outreach-sequences` run, and set
`outreach_auto_send` back to false. Checked afterwards: 0 leads, prospects, outreach rows,
`@example.test` users, replies or email events; 0 pending outreach jobs. The local DB keeps
the two migrations.
