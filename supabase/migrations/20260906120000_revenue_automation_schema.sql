-- Revenue Automation sprint (Week 1, data-foundation only): schema for the calls /
-- extraction / scoring / objection / follow-up pipeline. No automation logic, scoring
-- calculations, or email sending here -- just tables + RLS. RingCentral access isn't
-- available yet, so calls.ringcentral_call_id is nullable and nothing populates it today.
--
-- Design choices, and why (see docs/revenue-automation-schema.md for the full audit
-- this is based on):
--
-- - A "lead" here can be either an existing app user (profiles) or a not-yet-signed-up
--   B2B contact (institutional_leads) -- both are real call targets for revenue
--   automation (upgrade-recovery calls to users, sales calls to institutional leads).
--   calls/lead_scores/followup_sequences all carry BOTH fk's, nullable, with a check
--   constraint requiring at least one -- same "which kind of subject" shape
--   reply_events/profiles.referred_by_institutional_lead_id already use for
--   institutional_leads linkage.
-- - No standalone "emails" table exists in this codebase (outbound sends are tracked as
--   columns directly on institutional_leads, not as one-row-per-send records -- see
--   20260820120000_outbound_send_tracking_and_bounce_status.sql). The only real
--   per-email row with an id is reply_events (inbound replies). objections.email_id
--   references reply_events(id) for that reason; it will be null for anything that
--   isn't a reply-sourced objection.
-- - RLS: enabled on every table, admin/super_admin SELECT via current_user_has_role()
--   (the pattern named in CLAUDE.md / used by freemium_settings), no
--   insert/update/delete policies for authenticated -- writes are server-only (service
--   role), matching profile_roles/institutional_leads/reply_events.

-- ---------------------------------------------------------------------------
-- calls
-- ---------------------------------------------------------------------------
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  institutional_lead_id uuid references public.institutional_leads (id) on delete set null,
  occurred_at timestamptz not null default now(),
  ringcentral_call_id text,
  recording_reference text,
  -- App-validated vocabulary (no enum yet, same convention as institutional_leads.status):
  -- 'scheduled', 'completed', 'no_answer', 'voicemail', 'canceled'.
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  constraint calls_has_subject check (profile_id is not null or institutional_lead_id is not null)
);

create unique index if not exists calls_ringcentral_call_id_key
  on public.calls (ringcentral_call_id) where ringcentral_call_id is not null;
create index if not exists calls_profile_id_idx on public.calls (profile_id);
create index if not exists calls_institutional_lead_id_idx on public.calls (institutional_lead_id);

alter table public.calls enable row level security;

drop policy if exists "Admins can read calls" on public.calls;
create policy "Admins can read calls"
on public.calls
for select
to authenticated
using (
  public.current_user_has_role('admin')
  or public.current_user_has_role('super_admin')
);

grant select on public.calls to authenticated;
grant all on public.calls to service_role;

-- ---------------------------------------------------------------------------
-- call_extractions (one row per call: LLM/manual extraction of the call content)
-- ---------------------------------------------------------------------------
create table if not exists public.call_extractions (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls (id) on delete cascade,
  pain_point text,
  target_role text,
  sponsorship_context text,
  buying_intent text,
  objection text,
  timing text,
  promised_follow_up text,
  recommended_next_action text,
  confidence_score numeric(3, 2) check (confidence_score >= 0 and confidence_score <= 1),
  created_at timestamptz not null default now()
);

alter table public.call_extractions enable row level security;

drop policy if exists "Admins can read call_extractions" on public.call_extractions;
create policy "Admins can read call_extractions"
on public.call_extractions
for select
to authenticated
using (
  public.current_user_has_role('admin')
  or public.current_user_has_role('super_admin')
);

grant select on public.call_extractions to authenticated;
grant all on public.call_extractions to service_role;

-- ---------------------------------------------------------------------------
-- lead_scores (append-only: one row per computation, not a single mutable score)
-- ---------------------------------------------------------------------------
create table if not exists public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  institutional_lead_id uuid references public.institutional_leads (id) on delete cascade,
  intent_score numeric(5, 2) not null check (intent_score >= 0 and intent_score <= 100),
  scoring_factors jsonb not null default '{}'::jsonb,
  explanation text,
  computed_at timestamptz not null default now(),
  constraint lead_scores_has_subject check (profile_id is not null or institutional_lead_id is not null)
);

create index if not exists lead_scores_profile_id_computed_at_idx
  on public.lead_scores (profile_id, computed_at desc);
create index if not exists lead_scores_institutional_lead_id_computed_at_idx
  on public.lead_scores (institutional_lead_id, computed_at desc);

alter table public.lead_scores enable row level security;

drop policy if exists "Admins can read lead_scores" on public.lead_scores;
create policy "Admins can read lead_scores"
on public.lead_scores
for select
to authenticated
using (
  public.current_user_has_role('admin')
  or public.current_user_has_role('super_admin')
);

grant select on public.lead_scores to authenticated;
grant all on public.lead_scores to service_role;

-- ---------------------------------------------------------------------------
-- objections
-- ---------------------------------------------------------------------------
create table if not exists public.objections (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references public.calls (id) on delete cascade,
  email_id uuid references public.reply_events (id) on delete cascade,
  category text not null check (
    category in (
      'price', 'unclear_value', 'sponsorship_concerns', 'job_quality_freshness',
      'missing_capability', 'not_ready', 'already_employed', 'competitor',
      'no_response', 'other'
    )
  ),
  source text,
  notes text,
  created_at timestamptz not null default now(),
  constraint objections_has_source check (call_id is not null or email_id is not null)
);

create index if not exists objections_call_id_idx on public.objections (call_id);
create index if not exists objections_email_id_idx on public.objections (email_id);
create index if not exists objections_category_idx on public.objections (category);

alter table public.objections enable row level security;

drop policy if exists "Admins can read objections" on public.objections;
create policy "Admins can read objections"
on public.objections
for select
to authenticated
using (
  public.current_user_has_role('admin')
  or public.current_user_has_role('super_admin')
);

grant select on public.objections to authenticated;
grant all on public.objections to service_role;

-- ---------------------------------------------------------------------------
-- followup_sequences
-- ---------------------------------------------------------------------------
create table if not exists public.followup_sequences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  institutional_lead_id uuid references public.institutional_leads (id) on delete cascade,
  sequence_stage int not null check (sequence_stage >= 1),
  scheduled_date timestamptz not null,
  sent_date timestamptz,
  stop_reason text check (stop_reason in ('reply', 'subscribed', 'unsubscribed', 'manual_pause')),
  created_at timestamptz not null default now(),
  constraint followup_sequences_has_subject check (profile_id is not null or institutional_lead_id is not null)
);

create index if not exists followup_sequences_profile_id_idx on public.followup_sequences (profile_id);
create index if not exists followup_sequences_institutional_lead_id_idx
  on public.followup_sequences (institutional_lead_id);
-- Pending sends this batch job actually needs to find: not yet sent, not stopped.
create index if not exists followup_sequences_pending_idx
  on public.followup_sequences (scheduled_date) where sent_date is null and stop_reason is null;

alter table public.followup_sequences enable row level security;

drop policy if exists "Admins can read followup_sequences" on public.followup_sequences;
create policy "Admins can read followup_sequences"
on public.followup_sequences
for select
to authenticated
using (
  public.current_user_has_role('admin')
  or public.current_user_has_role('super_admin')
);

grant select on public.followup_sequences to authenticated;
grant all on public.followup_sequences to service_role;
