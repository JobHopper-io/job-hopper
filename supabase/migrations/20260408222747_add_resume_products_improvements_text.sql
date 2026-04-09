-- Plain-text resume improvement output from n8n (LLM) fulfillment.
ALTER TABLE public.resume_products
ADD COLUMN IF NOT EXISTS improvements_text text;
