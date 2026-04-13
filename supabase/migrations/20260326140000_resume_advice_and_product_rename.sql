-- Per-job resume advice product (one_time_addon).
-- Fulfillment text lives on resume_products.improvements_text (see later migrations).

INSERT INTO public.products (key, display_name, description, category, price_cents)
VALUES (
  'per_job_resume_advice',
  'Per-Job Resume Advice',
  'Get tailored guidance on how your resume lines up with this job and what to change to stand out.',
  'one_time_addon'::public.product_category,
  449
)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_cents = EXCLUDED.price_cents;
