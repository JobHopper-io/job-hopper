-- Enable RLS if not already enabled
ALTER TABLE public.job_hopper_live ENABLE ROW LEVEL SECURITY;

-- Optional: drop any broader read policies you currently have
DROP POLICY IF EXISTS "Allow authenticated read access to job_hopper_live" ON public.job_hopper_live;

-- New policy: only allow reading jobs that are matched to the current user
CREATE POLICY "Users can read only matched jobs"
ON public.job_hopper_live
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.job_matches jm
      ON jm.profile_id = p.id
    WHERE
      p.auth_user_id = auth.uid()
      AND jm.job_id = job_hopper_live.id
  )
);