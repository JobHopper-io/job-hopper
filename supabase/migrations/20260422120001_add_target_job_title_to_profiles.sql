-- Target role title free-text (complements role categories for matching context).
alter table public.profiles
  add column if not exists target_job_title text;
