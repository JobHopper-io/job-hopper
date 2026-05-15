-- Hiring contact cache (Apollo), job archive UI, algorithm tuning columns,
-- Apollo/public lookup quotas for edge functions.

-- 1) Hiring contact lookup status + cache table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hiring_contact_lookup_status') THEN
    CREATE TYPE public.hiring_contact_lookup_status AS ENUM ('found', 'not_found', 'error');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.job_hiring_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.job_hopper_live(id) ON DELETE CASCADE,
  external_job_key text,
  status public.hiring_contact_lookup_status NOT NULL,
  full_name text,
  title text,
  email text,
  linkedin_url text,
  apollo_person_id text,
  apollo_raw jsonb,
  error_message text,
  looked_up_by_profile_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_hiring_contacts_job_or_external CHECK (
    (job_id IS NULL) <> (external_job_key IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS job_hiring_contacts_job_id_uq
  ON public.job_hiring_contacts(job_id)
  WHERE job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS job_hiring_contacts_external_uq
  ON public.job_hiring_contacts(external_job_key)
  WHERE external_job_key IS NOT NULL;

ALTER TABLE public.job_hiring_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select hiring contacts for matched jobs" ON public.job_hiring_contacts;
CREATE POLICY "Users select hiring contacts for matched jobs"
  ON public.job_hiring_contacts
  FOR SELECT
  TO authenticated
  USING (
    (
      job_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.job_matches jm
        JOIN public.profiles p ON jm.profile_id = p.id
        WHERE p.auth_user_id = auth.uid()
          AND jm.job_id = job_hiring_contacts.job_id
      )
    )
    OR (
      external_job_key IS NOT NULL
      AND looked_up_by_profile_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.auth_user_id = auth.uid()
          AND p.id = job_hiring_contacts.looked_up_by_profile_id
      )
    )
  );

GRANT SELECT ON public.job_hiring_contacts TO authenticated;

-- 2) Archive matched jobs (dashboard UX)
ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DROP POLICY IF EXISTS "Users can update archive on own job_matches" ON public.job_matches;
CREATE POLICY "Users can update archive on own job_matches"
  ON public.job_matches
  FOR UPDATE
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

GRANT UPDATE (archived_at) ON public.job_matches TO authenticated;

-- 3) Profile-level exclusion phrases for matcher (job.title only)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS excluded_keywords text[] NOT NULL DEFAULT '{}';

-- 4) Matching algorithm: multi-token gate, global exclusions, semantic rerank toggles
ALTER TABLE public.matching_algorithm_config
  ADD COLUMN IF NOT EXISTS threshold_require_multi_token_title_match boolean NOT NULL DEFAULT true;

ALTER TABLE public.matching_algorithm_config
  ADD COLUMN IF NOT EXISTS excluded_title_keywords text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.matching_algorithm_config
  ADD COLUMN IF NOT EXISTS semantic_rerank_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.matching_algorithm_config
  ADD COLUMN IF NOT EXISTS semantic_rerank_count integer NOT NULL DEFAULT 30;

ALTER TABLE public.matching_algorithm_config
  ADD COLUMN IF NOT EXISTS semantic_weight double precision NOT NULL DEFAULT 1.5;

-- 5) Apollo spend tracking (UTC calendar days); edge increments via service role
CREATE TABLE IF NOT EXISTS public.apollo_usage_daily (
  usage_date date PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.apollo_usage_daily ENABLE ROW LEVEL SECURITY;

-- 6) Public BYO hiring-contact quota (service_role only at runtime)
CREATE TABLE IF NOT EXISTS public.public_lookup_usage (
  ip_network text NOT NULL,
  fingerprint text NOT NULL,
  successful_lookups integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_network, fingerprint)
);

ALTER TABLE public.public_lookup_usage ENABLE ROW LEVEL SECURITY;

-- Atomically increment Apollo usage counter for UTC date (service_role via RPC only).
CREATE OR REPLACE FUNCTION public.increment_apollo_usage_daily(p_delta integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date := (timezone('utc', now()))::date;
  v_delta integer := GREATEST(1, p_delta);
  v_count integer;
BEGIN
  INSERT INTO public.apollo_usage_daily (usage_date, request_count)
  VALUES (v_date, v_delta)
  ON CONFLICT (usage_date)
    DO UPDATE SET request_count = public.apollo_usage_daily.request_count + EXCLUDED.request_count
  RETURNING request_count INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_apollo_usage_daily(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_apollo_usage_daily(integer) TO service_role;
