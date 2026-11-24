# Deploying growth/day5-replies

Branch `growth/day5-replies` (from `growth/day7-recovery`). Nothing here is deployed yet.

## Order

1. **Migration** `20261124130000_reply_handling.sql` (after the day-7 migrations, which
   are already on hosted).
2. **Edge functions**, after the migration (all read the new columns):
   - `reply-ingest`: profile match, Message-ID idempotency
   - `classify-replies`: job-seeker classes, extraction, drafts, owner/next action,
     write-back, bounded retries
   - `admin-reply-events`: new columns, views, `mark_handled`
3. **Email worker** (`email-router-worker`, `wrangler deploy`): now sends `messageId`.
   Until it's redeployed, replies arrive without one and aren't de-duplicated (same as
   today).
4. **Frontend**: `/admin/reply-classification`.
5. Optional: `update public.growth_settings set default_reply_owner = '<profile id>' where id = 1;`
   (null = new replies stay unassigned).

## Behaviour to know

- Drafts are never sent. They're stored on `reply_events.draft_response` for a person to
  copy. A draft that quotes a price, names jobs/openings or claims sponsorship is replaced
  by a fixed safe text; pricing drafts always link to `/pricing`.
- The LLM gets the reply's subject and cleaned body only: no sender address; signature,
  quoted thread, email addresses, phone numbers and links removed.
- A reply that fails classification 3 times is flagged `needs_manual_review` and shows
  under "Needs manual review" on the admin page. A failed unsubscribe suppression is
  retried every sweep without counting toward that limit.
- `classify-replies` makes up to three LLM calls per reply (class, extraction, draft)
  instead of one.
- Existing processed replies keep their B2B class and get no extraction, draft or next
  action (no backfill).

## Outreach sequences (5b)

1. **Migration** `20261124140000_outreach_sequences.sql`, after `20261124130000`.
2. **Edge function secrets**: `OUTBOUND_POSTAL_ADDRESS` (same value the Node scripts use;
   without it every outreach send fails and is retried) and optionally `SENDER_NAME`.
   `UNSUBSCRIBE_EMAIL_SECRET` is already set.
3. **Edge functions**, after the migration: `outreach-sequences` (new),
   `recovery-sequences` (skips people emailed by outreach in the last 2 days),
   `admin-revenue-recovery-segments` (outreach view), then `run-scheduled-jobs` **last**:
   its watchdog starts the `outreach-sequences` daily chain.
4. `growth_settings.outreach_auto_send` stays **false**: the daily run only logs a
   preview. Stages 2-4 for leads and all prospect stages are DRAFT copy
   (`_shared/outbound-templates.mjs`); approve them before turning it on.
5. Enrolling replaces the old one-off send: `node scripts/outbound-live-send.mjs --preview`
   then `--campaign=<tag>` (add `--prospects` for approved, eligible job seekers).
