-- Depends on 20260413195609_job_processor_flags_and_runs.sql committing the
-- scraper_raw_job_status 'processing' value first.

create or replace function public.claim_scraper_raw_jobs(p_limit integer)
returns setof public.scraper_raw_jobs
language sql
as $$
  with cte as (
    select id
    from public.scraper_raw_jobs
    where status = 'pending'::public.scraper_raw_job_status
    order by date_scraped asc, id asc
    limit p_limit
    for update skip locked
  )
  update public.scraper_raw_jobs j
  set status = 'processing'::public.scraper_raw_job_status
  from cte
  where j.id = cte.id
  returning j.*;
$$;

revoke all on function public.claim_scraper_raw_jobs(integer) from public;
grant execute on function public.claim_scraper_raw_jobs(integer) to service_role;
