-- Growth step 3 (docs/growth/lead-system-design.md §4): widen email_events into the single
-- send log for every email -- transactional, marketing, and cold outbound -- so each
-- recipient keeps a full send history and the Mailtrap webhook can record delivery
-- outcomes against any send by provider_message_id. Needs the enum values added in
-- 20261120140000 / 20261120140100.

alter table public.email_events
  -- Person-level lead the email went to. No FK yet: public.prospects doesn't exist
  -- (design step 5); the FK is added with that table.
  add column if not exists prospect_id uuid,
  add column if not exists institutional_lead_id uuid
    references public.institutional_leads (id) on delete set null,
  add column if not exists to_email_normalized text
    check (to_email_normalized is null or to_email_normalized = public.normalize_email(to_email_normalized)),
  add column if not exists campaign text,
  add column if not exists sequence_stage int check (sequence_stage is null or sequence_stage >= 1),
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz;

comment on column public.email_events.prospect_id is
  'Person-level lead (public.prospects, design step 5). No FK until that table exists.';
comment on column public.email_events.to_email_normalized is
  'Recipient address, normalize_email()-normalized. Backfilled from profiles.email for rows sent before 2026-11-20, so an old row may show the profile''s current address rather than the one mailed.';

create index if not exists email_events_provider_message_id_idx
  on public.email_events (provider_message_id) where provider_message_id is not null;
create index if not exists email_events_institutional_lead_id_idx
  on public.email_events (institutional_lead_id) where institutional_lead_id is not null;
create index if not exists email_events_type_campaign_idx
  on public.email_events (type, campaign);

-- Backfill: rows logged by sendEmail before this column existed always had a profile_id.
update public.email_events e
set to_email_normalized = public.normalize_email(p.email)
from public.profiles p
where p.id = e.profile_id
  and e.to_email_normalized is null
  and public.normalize_email(p.email) <> '';

-- Records a provider delivery outcome on every email_events row for p_message_id.
-- Always stamps the matching timestamp (first one wins). Moves status only forward
-- (sent/failed < delivered < bounced < complained), so out-of-order webhook events can't
-- regress it. Returns the number of rows matched; 0 for an unknown message id.
create or replace function public.record_email_delivery_event(
  p_message_id text,
  p_status text,
  p_at timestamptz default now()
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_rank constant jsonb := '{"sent": 1, "failed": 1, "delivered": 2, "bounced": 3, "complained": 4}';
  v_count integer;
begin
  if p_status not in ('delivered', 'bounced', 'complained') then
    raise exception 'record_email_delivery_event: invalid status %', p_status;
  end if;

  update public.email_events e
  set delivered_at  = case when p_status = 'delivered'  then coalesce(e.delivered_at, p_at)  else e.delivered_at end,
      bounced_at    = case when p_status = 'bounced'    then coalesce(e.bounced_at, p_at)    else e.bounced_at end,
      complained_at = case when p_status = 'complained' then coalesce(e.complained_at, p_at) else e.complained_at end,
      status = case when (v_rank ->> p_status)::int > coalesce((v_rank ->> e.status::text)::int, 0)
                    then p_status::public.email_event_status
                    else e.status end
  where e.provider_message_id = p_message_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.record_email_delivery_event(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_email_delivery_event(text, text, timestamptz) to service_role;
