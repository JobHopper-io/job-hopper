-- Bounded 0–100 matching algorithm config (atomic replacement of legacy weight columns).

-- Archive non-active configs (old shape cannot be expressed in new schema).
update public.matching_algorithm_config
set archived = true
where active = false and archived = false;

-- Drop legacy columns
alter table public.matching_algorithm_config
  drop column if exists phrase_primary_title_weight,
  drop column if exists phrase_primary_description_weight,
  drop column if exists phrase_primary_briefing_weight,
  drop column if exists phrase_secondary_title_weight,
  drop column if exists phrase_secondary_description_weight,
  drop column if exists phrase_secondary_briefing_weight,
  drop column if exists phrase_industry_title_weight,
  drop column if exists phrase_industry_description_weight,
  drop column if exists phrase_industry_briefing_weight,
  drop column if exists phrase_min_primary_words,
  drop column if exists pay_inside_range_weight,
  drop column if exists pay_near_range_weight,
  drop column if exists pay_missing_salary_weight,
  drop column if exists pay_below_range_penalty,
  drop column if exists loc_same_metro_weight,
  drop column if exists loc_same_state_weight,
  drop column if exists loc_remote_preferred_weight,
  drop column if exists loc_relocation_allowed_weight,
  drop column if exists loc_other_location_penalty,
  drop column if exists loc_distance_0_10_weight,
  drop column if exists loc_distance_10_25_weight,
  drop column if exists loc_distance_25_50_weight,
  drop column if exists loc_distance_50_100_weight,
  drop column if exists loc_distance_beyond_100_weight,
  drop column if exists loc_within_radius_bonus_weight,
  drop column if exists recency_base_weight,
  drop column if exists recency_per_day_decay,
  drop column if exists recency_max_age_days,
  drop column if exists threshold_min_total_score,
  drop column if exists threshold_no_keyword_match_penalty,
  drop column if exists threshold_over_pay_tolerance_pct,
  drop column if exists threshold_under_pay_tolerance_pct;

-- Category mix (sum to 1.0)
alter table public.matching_algorithm_config
  add column if not exists cat_weight_phrase double precision,
  add column if not exists cat_weight_pay double precision,
  add column if not exists cat_weight_location double precision,
  add column if not exists cat_weight_recency double precision;

-- Phrase
alter table public.matching_algorithm_config
  add column if not exists phrase_target_specificity_words double precision,
  add column if not exists phrase_tier_factor_primary double precision,
  add column if not exists phrase_tier_factor_industry double precision,
  add column if not exists phrase_tier_factor_secondary double precision,
  add column if not exists phrase_surface_weight_title double precision,
  add column if not exists phrase_surface_weight_description double precision,
  add column if not exists phrase_surface_weight_briefing double precision,
  add column if not exists phrase_min_primary_words integer;

-- Pay
alter table public.matching_algorithm_config
  add column if not exists pay_missing_salary_quality double precision,
  add column if not exists pay_near_range_quality double precision,
  add column if not exists pay_above_range_quality double precision,
  add column if not exists pay_over_tolerance_fraction double precision,
  add column if not exists pay_under_tolerance_fraction double precision,
  add column if not exists pay_hard_floor_enabled boolean,
  add column if not exists pay_hard_floor_fraction double precision;

-- Location
alter table public.matching_algorithm_config
  add column if not exists loc_band_d0_10 double precision,
  add column if not exists loc_band_d10_25 double precision,
  add column if not exists loc_band_d25_50 double precision,
  add column if not exists loc_band_d50_100 double precision,
  add column if not exists loc_band_beyond_100 double precision,
  add column if not exists loc_same_metro_quality double precision,
  add column if not exists loc_same_state_quality double precision,
  add column if not exists loc_remote_as_perfect boolean,
  add column if not exists loc_relocation_gate_enabled boolean;

-- Recency + thresholds + gates
alter table public.matching_algorithm_config
  add column if not exists recency_max_age_days double precision,
  add column if not exists threshold_min_total_score double precision,
  add column if not exists phrase_gate_require_primary_or_industry boolean;

-- Deactivate all rows before reseed (partial unique index on active)
update public.matching_algorithm_config set active = false where active = true;

-- Backfill any remaining rows (archived legacy configs) so NOT NULL can apply
update public.matching_algorithm_config
set
  cat_weight_phrase = 0.5,
  cat_weight_pay = 0.15,
  cat_weight_location = 0.25,
  cat_weight_recency = 0.1,
  phrase_target_specificity_words = 3,
  phrase_tier_factor_primary = 1,
  phrase_tier_factor_industry = 0.7,
  phrase_tier_factor_secondary = 0.4,
  phrase_surface_weight_title = 0.6,
  phrase_surface_weight_description = 0.3,
  phrase_surface_weight_briefing = 0.1,
  phrase_min_primary_words = 2,
  pay_missing_salary_quality = 0.3,
  pay_near_range_quality = 0.5,
  pay_above_range_quality = 0.7,
  pay_over_tolerance_fraction = 0.25,
  pay_under_tolerance_fraction = 0.15,
  pay_hard_floor_enabled = false,
  pay_hard_floor_fraction = 0.3,
  loc_band_d0_10 = 1,
  loc_band_d10_25 = 0.85,
  loc_band_d25_50 = 0.65,
  loc_band_d50_100 = 0.35,
  loc_band_beyond_100 = 0,
  loc_same_metro_quality = 0.7,
  loc_same_state_quality = 0.4,
  loc_remote_as_perfect = true,
  loc_relocation_gate_enabled = false,
  recency_max_age_days = 45,
  threshold_min_total_score = 40,
  phrase_gate_require_primary_or_industry = true
where cat_weight_phrase is null;

insert into public.matching_algorithm_config (
  name,
  active,
  archived,
  cat_weight_phrase,
  cat_weight_pay,
  cat_weight_location,
  cat_weight_recency,
  phrase_target_specificity_words,
  phrase_tier_factor_primary,
  phrase_tier_factor_industry,
  phrase_tier_factor_secondary,
  phrase_surface_weight_title,
  phrase_surface_weight_description,
  phrase_surface_weight_briefing,
  phrase_min_primary_words,
  pay_missing_salary_quality,
  pay_near_range_quality,
  pay_above_range_quality,
  pay_over_tolerance_fraction,
  pay_under_tolerance_fraction,
  pay_hard_floor_enabled,
  pay_hard_floor_fraction,
  loc_band_d0_10,
  loc_band_d10_25,
  loc_band_d25_50,
  loc_band_d50_100,
  loc_band_beyond_100,
  loc_same_metro_quality,
  loc_same_state_quality,
  loc_remote_as_perfect,
  loc_relocation_gate_enabled,
  recency_max_age_days,
  threshold_min_total_score,
  phrase_gate_require_primary_or_industry
)
values (
  'Default v2 (bounded 0–100)',
  true,
  false,
  0.5,
  0.15,
  0.25,
  0.1,
  3,
  1,
  0.7,
  0.4,
  0.6,
  0.3,
  0.1,
  2,
  0.3,
  0.5,
  0.7,
  0.25,
  0.15,
  false,
  0.3,
  1,
  0.85,
  0.65,
  0.35,
  0,
  0.7,
  0.4,
  true,
  false,
  45,
  40,
  true
);

alter table public.matching_algorithm_config
  alter column cat_weight_phrase set not null,
  alter column cat_weight_pay set not null,
  alter column cat_weight_location set not null,
  alter column cat_weight_recency set not null,
  alter column phrase_target_specificity_words set not null,
  alter column phrase_tier_factor_primary set not null,
  alter column phrase_tier_factor_industry set not null,
  alter column phrase_tier_factor_secondary set not null,
  alter column phrase_surface_weight_title set not null,
  alter column phrase_surface_weight_description set not null,
  alter column phrase_surface_weight_briefing set not null,
  alter column phrase_min_primary_words set not null,
  alter column pay_missing_salary_quality set not null,
  alter column pay_near_range_quality set not null,
  alter column pay_above_range_quality set not null,
  alter column pay_over_tolerance_fraction set not null,
  alter column pay_under_tolerance_fraction set not null,
  alter column pay_hard_floor_enabled set not null,
  alter column pay_hard_floor_fraction set not null,
  alter column loc_band_d0_10 set not null,
  alter column loc_band_d10_25 set not null,
  alter column loc_band_d25_50 set not null,
  alter column loc_band_d50_100 set not null,
  alter column loc_band_beyond_100 set not null,
  alter column loc_same_metro_quality set not null,
  alter column loc_same_state_quality set not null,
  alter column loc_remote_as_perfect set not null,
  alter column loc_relocation_gate_enabled set not null,
  alter column recency_max_age_days set not null,
  alter column threshold_min_total_score set not null,
  alter column phrase_gate_require_primary_or_industry set not null;
