-- matching_algorithm_config: stores named, versioned configurations for the job-matching algorithm.
-- Each row is a full set of weights/thresholds; exactly one row should be active at any time.

create table if not exists public.matching_algorithm_config (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default false,

  -- Keyword weights
  keyword_current_job_title_weight double precision not null,
  keyword_current_industry_weight double precision not null,

  -- Pay weights
  pay_inside_range_weight double precision not null,
  pay_near_range_weight double precision not null,
  pay_missing_salary_weight double precision not null,
  pay_below_range_penalty double precision not null,

  -- Location weights (categorical and distance-based)
  loc_same_metro_weight double precision not null,
  loc_same_state_weight double precision not null,
  loc_remote_preferred_weight double precision not null,
  loc_relocation_allowed_weight double precision not null,
  loc_other_location_penalty double precision not null,
  loc_distance_0_10_weight double precision not null,
  loc_distance_10_25_weight double precision not null,
  loc_distance_25_50_weight double precision not null,
  loc_distance_50_100_weight double precision not null,
  loc_distance_beyond_100_weight double precision not null,
  loc_within_radius_bonus_weight double precision not null,

  -- Recency weights
  recency_base_weight double precision not null,
  recency_per_day_decay double precision not null,
  recency_max_age_days double precision not null,

  -- Thresholds
  threshold_min_total_score double precision not null,
  threshold_no_keyword_match_penalty double precision not null,
  threshold_over_pay_tolerance_pct double precision not null,
  threshold_under_pay_tolerance_pct double precision not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enforce at most one active configuration. The partial unique index ensures there can
-- never be two rows with active = true at the same time.
create unique index if not exists matching_algorithm_config_single_active_idx
on public.matching_algorithm_config ((active))
where active;

-- Trigger to keep updated_at in sync.
create or replace function public.set_matching_algorithm_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_matching_algorithm_config_updated_at
on public.matching_algorithm_config;

create trigger set_matching_algorithm_config_updated_at
before update on public.matching_algorithm_config
for each row
execute function public.set_matching_algorithm_config_updated_at();

-- Seed an initial configuration that mirrors the current defaultConfig / DEFAULT_ADMIN_MATCH_CONFIG
-- so behavior remains unchanged after this migration. This row will be marked active.
insert into public.matching_algorithm_config (
  name,
  active,
  keyword_current_job_title_weight,
  keyword_current_industry_weight,
  pay_inside_range_weight,
  pay_near_range_weight,
  pay_missing_salary_weight,
  pay_below_range_penalty,
  loc_same_metro_weight,
  loc_same_state_weight,
  loc_remote_preferred_weight,
  loc_relocation_allowed_weight,
  loc_other_location_penalty,
  loc_distance_0_10_weight,
  loc_distance_10_25_weight,
  loc_distance_25_50_weight,
  loc_distance_50_100_weight,
  loc_distance_beyond_100_weight,
  loc_within_radius_bonus_weight,
  recency_base_weight,
  recency_per_day_decay,
  recency_max_age_days,
  threshold_min_total_score,
  threshold_no_keyword_match_penalty,
  threshold_over_pay_tolerance_pct,
  threshold_under_pay_tolerance_pct
)
select
  'Initial default',
  true,
  2,     -- keyword_current_job_title_weight
  1,     -- keyword_current_industry_weight
  4,     -- pay_inside_range_weight
  2,     -- pay_near_range_weight
  1,     -- pay_missing_salary_weight
  -2,    -- pay_below_range_penalty
  4,     -- loc_same_metro_weight
  2,     -- loc_same_state_weight
  3,     -- loc_remote_preferred_weight
  1,     -- loc_relocation_allowed_weight
  -3,    -- loc_other_location_penalty
  4,     -- loc_distance_0_10_weight
  3,     -- loc_distance_10_25_weight
  2,     -- loc_distance_25_50_weight
  1,     -- loc_distance_50_100_weight
  0,     -- loc_distance_beyond_100_weight
  3,     -- loc_within_radius_bonus_weight
  3,     -- recency_base_weight
  0.1,   -- recency_per_day_decay
  45,    -- recency_max_age_days
  5,     -- threshold_min_total_score
  -100,  -- threshold_no_keyword_match_penalty
  0.25,  -- threshold_over_pay_tolerance_pct
  0.15   -- threshold_under_pay_tolerance_pct
where not exists (
  select 1 from public.matching_algorithm_config
);

-- RLS: configs are readable only by admins via helper functions / RPCs; not directly by regular clients.
alter table public.matching_algorithm_config enable row level security;

drop policy if exists "Admins can read matching configs" on public.matching_algorithm_config;

create policy "Admins can read matching configs"
on public.matching_algorithm_config
for select
to authenticated
using (
  public.current_user_has_role('admin')
);

-- No insert/update/delete policies for authenticated role: only service_role / backend code can modify configs.

