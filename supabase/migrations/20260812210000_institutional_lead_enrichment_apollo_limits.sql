insert into public.apollo_limits (name, usage, credit_limit)
values ('institutional_lead_enrichment', 0, 200)
on conflict (name) do nothing;
