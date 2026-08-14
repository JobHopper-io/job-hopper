insert into public.apollo_limits (name, usage, credit_limit)
values ('career_partner_discovery', 0, 200)
on conflict (name) do nothing;
