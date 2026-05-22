-- Filter Matches: tunable category weight (role category today; more signals later).
alter table public.matching_algorithm_config
  add column if not exists cat_weight_filter_matches double precision;

update public.matching_algorithm_config
set
  cat_weight_filter_matches = 0.05,
  cat_weight_phrase = 0.45
where cat_weight_filter_matches is null;

alter table public.matching_algorithm_config
  alter column cat_weight_filter_matches set not null,
  alter column cat_weight_filter_matches set default 0.05;
