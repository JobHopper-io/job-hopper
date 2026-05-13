-- Remote-friendly entry point for the same logic as
-- supabase/scripts/clean_scraper_raw_jobs_n8n_parity.sql (dedupe pending, then
-- drop excluded / already-live matches). Call via PostgREST RPC with the
-- service_role key only (see revoke/grant below).

create or replace function public.clean_scraper_raw_jobs_n8n_parity()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  n_duplicates integer;
  n_exclusion_live integer;
begin
  with ranked as (
    select
      id,
      row_number() over (
        partition by
          coalesce(to_jsonb(job_title)::text, ''),
          coalesce(to_jsonb(company_name)::text, ''),
          coalesce(to_jsonb(apply_link)::text, '')
        order by date_scraped asc nulls last, id asc
      ) as rn
    from public.scraper_raw_jobs
    where status = 'pending'::public.scraper_raw_job_status
  )
  delete from public.scraper_raw_jobs r
  using ranked x
  where r.id = x.id
    and x.rn > 1;

  get diagnostics n_duplicates = row_count;

  delete from public.scraper_raw_jobs r
  where r.status = 'pending'::public.scraper_raw_job_status
    and (
      exists (
        select 1
        from public.exclusion_lists e
        where r.company_name = e.company_name
      )
      or exists (
        select 1
        from public.job_hopper_live j
        where j.company_name = r.company_name
          and j.job_title = r.job_title
          and (
            (
              coalesce(r.posted_date, current_timestamp)::date
              - coalesce(j.posted_date, j.created_at)::date
            ) < 30
            or r.apply_link = j.apply_link
          )
      )
    );

  get diagnostics n_exclusion_live = row_count;

  return jsonb_build_object(
    'duplicates_removed',
    n_duplicates,
    'exclusion_or_live_removed',
    n_exclusion_live
  );
end;
$$;

revoke all on function public.clean_scraper_raw_jobs_n8n_parity() from public;
grant execute on function public.clean_scraper_raw_jobs_n8n_parity() to service_role;
