-- Phrase-based job title / industry matching: replace flat keyword weights with
-- per-surface weights (title, description, briefing) for primary, secondary, and industry tiers.

alter table public.matching_algorithm_config
  add column if not exists phrase_primary_title_weight double precision,
  add column if not exists phrase_primary_description_weight double precision,
  add column if not exists phrase_primary_briefing_weight double precision,
  add column if not exists phrase_secondary_title_weight double precision,
  add column if not exists phrase_secondary_description_weight double precision,
  add column if not exists phrase_secondary_briefing_weight double precision,
  add column if not exists phrase_industry_title_weight double precision,
  add column if not exists phrase_industry_description_weight double precision,
  add column if not exists phrase_industry_briefing_weight double precision,
  add column if not exists phrase_min_primary_words integer;

-- Backfill from legacy keyword columns (must run before dropping keyword_*)
update public.matching_algorithm_config
set
  phrase_primary_title_weight = greatest(keyword_current_job_title_weight * 2, 4),
  phrase_primary_description_weight = greatest(keyword_current_job_title_weight, 1),
  phrase_primary_briefing_weight = 0,
  phrase_secondary_title_weight = greatest(keyword_current_job_title_weight / 2, 1),
  phrase_secondary_description_weight = greatest(keyword_current_job_title_weight / 4, 0.5),
  phrase_secondary_briefing_weight = 0,
  phrase_industry_title_weight = greatest(keyword_current_industry_weight * 2, 2),
  phrase_industry_description_weight = greatest(keyword_current_industry_weight, 1),
  phrase_industry_briefing_weight = 0,
  phrase_min_primary_words = 2;

alter table public.matching_algorithm_config
  alter column phrase_primary_title_weight set not null,
  alter column phrase_primary_description_weight set not null,
  alter column phrase_primary_briefing_weight set not null,
  alter column phrase_secondary_title_weight set not null,
  alter column phrase_secondary_description_weight set not null,
  alter column phrase_secondary_briefing_weight set not null,
  alter column phrase_industry_title_weight set not null,
  alter column phrase_industry_description_weight set not null,
  alter column phrase_industry_briefing_weight set not null,
  alter column phrase_min_primary_words set not null;

alter table public.matching_algorithm_config
  drop column if exists keyword_current_job_title_weight,
  drop column if exists keyword_current_industry_weight;
