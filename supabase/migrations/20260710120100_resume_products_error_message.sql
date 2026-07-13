-- Give resume_products somewhere to record why fulfillment failed.
--
-- Unlike scheduled_jobs, this table had no error_message column, so a failed row
-- could not explain itself to the user. Also index the sweeper's access path
-- (pending rows older than a threshold).

ALTER TABLE public.resume_products
  ADD COLUMN IF NOT EXISTS error_message text NULL;

CREATE INDEX IF NOT EXISTS idx_resume_products_status_created_at
  ON public.resume_products(status, created_at)
  WHERE status = 'pending';
