-- Outreach draft: once a reveal request is approved, the employer needs to actually message
-- the candidate. Cache the LLM-drafted message on the request row itself, same pattern as
-- job_matches.why_fit_bullets - generate once, persist, don't regenerate on every page load.
alter table public.employer_reveal_requests
  add column outreach_draft_subject text,
  add column outreach_draft_body text,
  add column outreach_draft_generated_at timestamptz;
