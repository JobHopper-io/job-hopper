-- Soft-delete for matching algorithm configs: archived rows are hidden from admin lists
-- and must not be used as the active production config.

alter table public.matching_algorithm_config
  add column if not exists archived boolean not null default false;

create index if not exists matching_algorithm_config_not_archived_idx
  on public.matching_algorithm_config (archived)
  where not archived;
