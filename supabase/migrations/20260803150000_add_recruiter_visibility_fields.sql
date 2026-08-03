-- Phase 1 of Recruiter-Visible Mode (docs/recruiter-visible-mode-build-plan.md): seeker-side
-- opt-in only. No employer-facing surface reads these yet.
alter table public.profiles
  add column recruiter_visible boolean not null default false,
  add column current_employer text;
