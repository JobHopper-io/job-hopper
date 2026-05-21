-- Phase 0: remove unused fixed-divisor phrase specificity (replaced by subscriber-relative length in code).
alter table public.matching_algorithm_config
  drop column if exists phrase_target_specificity_words;
