-- Growth step 3: backfill the email_events send log with outbound emails sent before it
-- existed, which are recorded only as institutional_leads.status 'contacted' / 'bounced'
-- (scripts/outbound-live-send.mjs set 'contacted' after a successful send;
-- mailtrap-bounce-webhook set 'bounced' on a hard bounce).
--
-- One row per email actually sent, matching how outbound-live-send.mjs now logs: leads
-- sharing a provider_message_id were one merged send, so they collapse to one row (the
-- highest-scored lead as institutional_lead_id, all of them in the payload). A lead with
-- no provider_message_id is its own row. Status 'sent', or 'bounced' with bounced_at for
-- bounced leads. payload.backfilled = true.
--
-- Skips any send that already has an outbound row with the same provider_message_id (or,
-- with no message id, an earlier backfilled row for the same lead), so re-running is a
-- no-op. Leads whose status moved on after the send (e.g. 'dead') aren't included.

with src as (
  select
    l.*,
    coalesce(l.provider_message_id, 'lead:' || l.id::text) as send_key
  from public.institutional_leads l
  where l.status in ('contacted', 'bounced')
),
sends as (
  select
    send_key,
    max(provider_message_id) as provider_message_id,
    (array_agg(id order by opportunity_score desc nulls last, organization_name))[1] as primary_lead_id,
    array_agg(id order by opportunity_score desc nulls last, organization_name) as lead_ids,
    array_agg(organization_name order by opportunity_score desc nulls last, organization_name) as org_names,
    (array_agg(contact_email order by opportunity_score desc nulls last, organization_name)
      filter (where contact_email is not null))[1] as contact_email,
    (array_agg(category order by opportunity_score desc nulls last, organization_name))[1] as category,
    max(campaign) as campaign,
    max(last_send_attempted_at) as sent_at,
    max(created_at) as fallback_at,
    bool_or(status = 'bounced') as bounced,
    max(updated_at) filter (where status = 'bounced') as bounced_at,
    count(*) as lead_count
  from src
  group by send_key
)
insert into public.email_events (
  type, status, sent_at, provider_message_id, campaign, institutional_lead_id,
  to_email_normalized, bounced_at, template_key, payload
)
select
  'outbound',
  case when s.bounced then 'bounced' else 'sent' end::public.email_event_status,
  coalesce(s.sent_at, s.fallback_at),
  s.provider_message_id,
  s.campaign,
  s.primary_lead_id,
  nullif(public.normalize_email(s.contact_email), ''),
  case when s.bounced then coalesce(s.bounced_at, s.sent_at, s.fallback_at) end,
  'outbound_' || s.category || case when s.lead_count > 1 then '_generic' else '' end,
  jsonb_build_object(
    'backfilled', true,
    'institutional_lead_ids', to_jsonb(s.lead_ids),
    'organization_names', to_jsonb(s.org_names),
    'category', s.category,
    'merged', s.lead_count > 1
  )
from sends s
where not exists (
    select 1 from public.email_events e
    where e.type = 'outbound'
      and s.provider_message_id is not null
      and e.provider_message_id = s.provider_message_id
  )
  and not exists (
    select 1 from public.email_events e
    where e.type = 'outbound'
      and s.provider_message_id is null
      and e.institutional_lead_id = s.primary_lead_id
      and e.payload ->> 'backfilled' = 'true'
  );
