-- Tracks whether the user has seen the post-signup feature-tour walkthrough (separate from
-- profiles.onboarding_completed, which gates the mandatory profile/plan-selection wizard).
alter table public.profiles
  add column has_seen_walkthrough boolean not null default false;
