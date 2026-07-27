-- Skills-gap analysis (JobDetail): cache for the LLM-generated comparison of a candidate's
-- resume against a specific job posting - skills they already show, skills the job wants
-- that they don't, and generic topics to learn to close the gap. Generated once per match
-- (on-demand, from the generate-skills-gap edge function) and cached here, mirroring
-- why_fit_bullets (20260723120000_job_matches_why_fit.sql).
ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS skills_gap jsonb,
  ADD COLUMN IF NOT EXISTS skills_gap_generated_at timestamptz;
