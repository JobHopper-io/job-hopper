-- Curated phrase synonyms for job title / industry matching (e.g. RN -> registered nurse).
-- Empty at install; admins can seed rows via SQL or a future admin UI.

CREATE TABLE IF NOT EXISTS public.match_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_synonyms_canonical_nonempty CHECK (length(trim(canonical)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS match_synonyms_canonical_lower_unique
  ON public.match_synonyms (lower(trim(canonical)));

COMMENT ON TABLE public.match_synonyms IS
  'Maps career phrases to canonical forms and aliases for phrase matching expansion.';

ALTER TABLE public.match_synonyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY match_synonyms_select_authenticated
  ON public.match_synonyms
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY match_synonyms_all_service_role
  ON public.match_synonyms
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_match_synonyms_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_synonyms_updated_at ON public.match_synonyms;
CREATE TRIGGER match_synonyms_updated_at
  BEFORE UPDATE ON public.match_synonyms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_match_synonyms_updated_at();
