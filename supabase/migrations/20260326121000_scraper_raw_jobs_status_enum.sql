-- scraper_raw_jobs.status: text → enum (pending | processed).

do $$ begin
  create type public.scraper_raw_job_status as enum ('pending', 'processed');
exception
  when duplicate_object then null;
end $$;

alter table public.scraper_raw_jobs
  alter column status drop default;

alter table public.scraper_raw_jobs
  alter column status type public.scraper_raw_job_status
  using (
    case lower(trim(status::text))
      when 'processed' then 'processed'::public.scraper_raw_job_status
      else 'pending'::public.scraper_raw_job_status
    end
  );

alter table public.scraper_raw_jobs
  alter column status set default 'pending'::public.scraper_raw_job_status;
