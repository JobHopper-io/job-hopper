-- Per-job resume advice is purchased in job context (job_match_id), not as a subscription add-on.
-- Classify it as one_time_item so it is excluded from getAddonProducts / manage-subscription add-on UIs.
UPDATE public.products
SET category = 'one_time_item'::public.product_category
WHERE key = 'per_job_resume_advice';
