-- Outreach sequences (docs/growth/day5-demo.md): 4-stage cold outreach to institutional
-- leads and job-seeker prospects on followup_sequences, sent by the outreach-sequences
-- function (_shared/outreach-sequences.ts). scripts/outbound-live-send.mjs enrolls.
--
--   1. followup_sequences: prospect_id subject, claimed_at (atomic claim of a due row),
--      one row per (lead|prospect, sequence, stage), stop reasons signed_up/converted
--   2. growth_settings: outreach_auto_send (off), outreach_max_per_run (25)
--   3. outreach_send_state(): what's checked right before every outreach send
--   4. recovery_send_state(): adds recent_outreach, so recovery waits 2 days after an
--      outreach email to the same address (and outreach waits after recovery, via 3)

-- 1 -------------------------------------------------------------------------------------

-- ON DELETE CASCADE like profile_id / institutional_lead_id: with SET NULL, deleting a
-- prospect whose row has no other subject would violate followup_sequences_has_subject.
alter table public.followup_sequences
  add column if not exists prospect_id uuid references public.prospects (id) on delete cascade,
  add column if not exists claimed_at timestamptz;

alter table public.followup_sequences drop constraint if exists followup_sequences_has_subject;
alter table public.followup_sequences add constraint followup_sequences_has_subject
  check (profile_id is not null or institutional_lead_id is not null or prospect_id is not null);

-- The recovery index covers profile_id; NULLs are distinct, so each subject needs its own.
create unique index if not exists followup_sequences_lead_sequence_stage_key
  on public.followup_sequences (institutional_lead_id, sequence_key, sequence_stage);
create unique index if not exists followup_sequences_prospect_sequence_stage_key
  on public.followup_sequences (prospect_id, sequence_key, sequence_stage);
create index if not exists followup_sequences_prospect_id_idx
  on public.followup_sequences (prospect_id) where prospect_id is not null;

alter table public.followup_sequences drop constraint if exists followup_sequences_stop_reason_check;
alter table public.followup_sequences add constraint followup_sequences_stop_reason_check
  check (stop_reason in ('reply', 'subscribed', 'unsubscribed', 'manual_pause',
                         'paid', 'bounced', 'complained', 'no_consent',
                         'signed_up', 'converted'));

-- 2 -------------------------------------------------------------------------------------

alter table public.growth_settings
  add column if not exists outreach_auto_send boolean not null default false,
  add column if not exists outreach_max_per_run integer not null default 25
    check (outreach_max_per_run between 1 and 500);

-- 3 -------------------------------------------------------------------------------------

-- State for one outreach subject (exactly one of p_lead_id / p_prospect_id), read right
-- before each send. p_since: when the sequence started (stage-1 row created); any reply
-- from this person since then stops it.
--   eligible: lead -> organization not on exclusion_lists (case-insensitive, trimmed);
--             prospect -> prospect_send_eligibility.eligible
--   signed_up / paid: a profile with this address exists / has live access
--   last_outreach_at / last_recovery_at: latest non-failed email of that kind to the
--             address (outreach = type outbound with an outreach_ campaign)
create or replace function public.outreach_send_state(p_lead_id uuid, p_prospect_id uuid, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with subject as (
    select public.normalize_email(l.contact_email) as email, l.organization_name, null::uuid as prospect_profile_id
    from public.institutional_leads l where p_lead_id is not null and l.id = p_lead_id
    union all
    select p.email_normalized, null, p.profile_id
    from public.prospects p where p_lead_id is null and p.id = p_prospect_id
  ),
  sup as (select s.reason from public.suppressed_emails s join subject on s.email_normalized = subject.email),
  prof as (
    select pr.id from public.profiles pr, subject
    where pr.id = subject.prospect_profile_id or public.normalize_email(pr.email) = subject.email
    limit 1
  ),
  elig as (
    select case
      when p_lead_id is not null then
        case when exists (select 1 from public.exclusion_lists e, subject
                          where lower(trim(e.company_name)) = lower(trim(subject.organization_name)))
             then 'exclusion_lists' end
      else (select v.ineligible_reason from public.prospect_send_eligibility v where v.prospect_id = p_prospect_id)
    end as reason
  )
  select jsonb_build_object(
    'exists', exists (select 1 from subject where email is not null),
    'email', (select email from subject),
    'replied', exists (
      select 1 from public.reply_events r, subject
      where r.received_at >= p_since
        and ((p_lead_id is not null and r.institutional_lead_id = p_lead_id)
             or (p_prospect_id is not null and r.prospect_id = p_prospect_id)
             or lower(r.from_email) = subject.email)),
    'unsubscribed', exists (select 1 from sup where reason = 'unsubscribe'),
    'bounced', exists (select 1 from sup where reason = 'hard_bounce'),
    'complained', exists (select 1 from sup where reason = 'spam_complaint'),
    'manual', exists (select 1 from sup where reason = 'manual'),
    'signed_up', exists (select 1 from prof),
    'paid', coalesce((select public.profile_has_live_access(id) from prof), false),
    'ineligible_reason', (select reason from elig),
    'last_outreach_at', (
      select max(e.sent_at) from public.email_events e, subject
      where e.to_email_normalized = subject.email and e.type = 'outbound'
        and e.status <> 'failed' and e.campaign like 'outreach\_%'),
    'last_recovery_at', (
      select max(e.sent_at) from public.email_events e, subject
      where e.to_email_normalized = subject.email and e.type = 'recovery' and e.status <> 'failed')
  )
$$;

revoke execute on function public.outreach_send_state(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.outreach_send_state(uuid, uuid, timestamptz) to service_role;

-- 4 -------------------------------------------------------------------------------------

-- Same as 20261124120100 plus recent_outreach: an outreach email to this address in the
-- last 2 days (recovery skips, doesn't stop).
create or replace function public.recovery_send_state(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (select id, public.normalize_email(email) as email from public.profiles where id = p_profile_id),
  sup as (select reason from public.suppressed_emails s join p on s.email_normalized = p.email)
  select jsonb_build_object(
    'exists', exists (select 1 from p),
    'live_access', public.profile_has_live_access(p_profile_id),
    'past_due', exists (select 1 from public.subscriptions s where s.profile_id = p_profile_id and s.status = 'past_due'),
    'unsubscribed', exists (select 1 from sup where reason = 'unsubscribe')
                    or exists (select 1 from public.notification_settings n
                               where n.profile_id = p_profile_id and n.email_unsubscribed_at is not null),
    'bounced', exists (select 1 from sup where reason = 'hard_bounce'),
    'complained', exists (select 1 from sup where reason = 'spam_complaint'),
    'manual', exists (select 1 from sup where reason = 'manual'),
    'marketing_consent', coalesce(public.current_marketing_consent(p_profile_id), false),
    'recent_outreach', exists (
      select 1 from public.email_events e join p on e.to_email_normalized = p.email
      where e.type = 'outbound' and e.status <> 'failed' and e.campaign like 'outreach\_%'
        and e.sent_at > now() - interval '2 days')
  )
$$;
