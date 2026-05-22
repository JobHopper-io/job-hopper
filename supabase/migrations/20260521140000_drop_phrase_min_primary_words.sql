-- phrase_min_primary_words is unused after content-aware sub-span phrase matching.

alter table public.matching_algorithm_config
  drop column if exists phrase_min_primary_words;
