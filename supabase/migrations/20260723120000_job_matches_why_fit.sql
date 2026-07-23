-- "Why this is a fit" (JobDetail): cache for the LLM-generated bullets comparing a
-- candidate's profile directly against a specific job spec. Generated once per match
-- (on-demand, from the generate-why-fit edge function) and cached here so repeat views
-- of the same job never re-trigger an LLM call.
ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS why_fit_bullets jsonb,
  ADD COLUMN IF NOT EXISTS why_fit_generated_at timestamptz;
