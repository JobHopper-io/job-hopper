-- Job matching: job_matches and saved_jobs tables

-- 1. job_matches: records which jobs have been matched to which profile.
CREATE TABLE IF NOT EXISTS public.job_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id integer NOT NULL REFERENCES public.job_hopper_live(id) ON DELETE CASCADE,
  score double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure we never store duplicate matches for the same profile/job pair.
CREATE UNIQUE INDEX IF NOT EXISTS job_matches_profile_job_key
  ON public.job_matches(profile_id, job_id);

CREATE INDEX IF NOT EXISTS idx_job_matches_profile_created_at
  ON public.job_matches(profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.saved_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.job_matches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS saved_jobs_profile_match_key
  ON public.saved_jobs(profile_id, match_id);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_profile_created_at
  ON public.saved_jobs(profile_id, created_at DESC);

-- 3. RLS: job_matches is write-only from service_role; users can only read their own matches.
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their job_matches rows" ON public.job_matches;
CREATE POLICY "Users can view their job_matches rows" ON public.job_matches
  FOR SELECT
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- 4. RLS: saved_jobs is managed by authenticated users for their own profile.
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their saved_jobs rows" ON public.saved_jobs;
CREATE POLICY "Users can manage their saved_jobs rows" ON public.saved_jobs
  FOR SELECT
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can insert their saved_jobs rows" ON public.saved_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can delete their saved_jobs rows" ON public.saved_jobs
  FOR DELETE
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- 5. Grants: allow authenticated clients to read and manage saved_jobs; job_matches is read-only.
GRANT SELECT ON public.job_matches TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.saved_jobs TO authenticated;

