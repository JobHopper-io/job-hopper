-- Stores Apollo org candidates when scores tie at the top; user must pick one (or decline) before people search.

alter table public.job_hiring_contacts
  add column if not exists org_disambiguation_options jsonb null;

comment on column public.job_hiring_contacts.org_disambiguation_options is
  'JSON array of { apollo_organization_id, name, primary_domain, score } when premium-insights needs user org choice. Cleared after selection, decline, or terminal failure.';
