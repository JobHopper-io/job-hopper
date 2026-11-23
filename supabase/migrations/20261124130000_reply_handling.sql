-- Reply handling: job-seeker reply classes, extraction, drafts, owners and next actions,
-- idempotent ingest and bounded classification retries (classify-replies,
-- _shared/reply-processing.ts).
--
-- reply_events:
--   profile_id           sender matched to a signed-up user (reply-ingest)
--   message_id           email Message-ID; unique, so a re-delivered email is ignored
--   audience             'b2b' (institutional lead, or unmatched) | 'b2c' (prospect or
--                        profile, no lead); picks the class set and prompt
--   extracted            {need, roles, locations, timeline, question, sentiment}
--   draft_response       suggested reply, NEVER sent automatically
--   assigned_to, next_action, next_action_due, handled_at
--   classify_attempts, last_classify_error, needs_manual_review: a reply that keeps
--                        failing classification stops being retried after the max
--                        attempts and waits for a person
-- growth_settings.default_reply_owner: owner for new replies (null = unassigned).

alter table public.reply_events
  add column if not exists profile_id uuid references public.profiles (id) on delete set null,
  add column if not exists message_id text,
  add column if not exists audience text check (audience in ('b2b', 'b2c')),
  add column if not exists extracted jsonb,
  add column if not exists draft_response text,
  add column if not exists draft_generated_at timestamptz,
  add column if not exists assigned_to uuid references public.profiles (id) on delete set null,
  add column if not exists next_action text,
  add column if not exists next_action_due timestamptz,
  add column if not exists handled_at timestamptz,
  add column if not exists classify_attempts integer not null default 0,
  add column if not exists last_classify_error text,
  add column if not exists needs_manual_review boolean not null default false;

-- Plain (not partial) unique index so reply-ingest can upsert on it; NULLs stay distinct.
create unique index if not exists reply_events_message_id_key on public.reply_events (message_id);

-- classify-replies picks unprocessed rows that aren't waiting for manual review.
drop index if exists public.reply_events_unprocessed_idx;
create index if not exists reply_events_unprocessed_idx
  on public.reply_events (received_at) where processed = false and needs_manual_review = false;

create index if not exists reply_events_open_actions_idx
  on public.reply_events (next_action_due) where handled_at is null and next_action is not null;
create index if not exists reply_events_profile_id_idx on public.reply_events (profile_id) where profile_id is not null;

alter table public.growth_settings
  add column if not exists default_reply_owner uuid references public.profiles (id) on delete set null;
