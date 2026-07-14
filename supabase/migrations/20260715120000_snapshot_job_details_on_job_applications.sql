-- Snapshot job details onto job_applications at tracking time, instead of joining
-- job_matches -> job_hopper_live on every read. job_hopper_live only holds currently
-- "live" listings, so a pure join loses the apply link (and title/company) the moment
-- a tracked job is pruned or expires -- exactly the case where a user most wants to
-- revisit the posting they applied to. Storing a snapshot keeps the tracker durable.

alter table public.job_applications
  add column if not exists job_id uuid,
  add column if not exists job_title text,
  add column if not exists company_name text,
  add column if not exists apply_link text,
  add column if not exists location text,
  add column if not exists pay_min real,
  add column if not exists pay_max real,
  add column if not exists pay_type public.pay_type;

-- Backfill existing rows from the current job_matches / job_hopper_live join.
update public.job_applications ja
set
  job_id = jhl.id,
  job_title = jhl.job_title,
  company_name = jhl.company_name,
  apply_link = jhl.apply_link,
  location = jhl.location,
  pay_min = jhl.pay_min,
  pay_max = jhl.pay_max,
  pay_type = jhl.pay_type
from public.job_matches jm
join public.job_hopper_live jhl on jhl.id = jm.job_id
where jm.id = ja.match_id
  and ja.job_title is null;
