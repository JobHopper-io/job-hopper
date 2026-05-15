-- Per verified-auth-user quota for public hiring-contact teaser (non-subscribers).

CREATE TABLE IF NOT EXISTS public.public_teaser_hiring_contact_usage (
  auth_user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  successful_lookups integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.public_teaser_hiring_contact_usage ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.public_teaser_hiring_contact_usage IS
  'Counts completed teaser lookups (found/not_found after Apollo) per auth user; edge functions only.';

CREATE OR REPLACE FUNCTION public.increment_public_teaser_hiring_contact_usage(p_auth_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.public_teaser_hiring_contact_usage (auth_user_id, successful_lookups)
  VALUES (p_auth_user_id, 1)
  ON CONFLICT (auth_user_id)
    DO UPDATE SET
      successful_lookups = public_teaser_hiring_contact_usage.successful_lookups + 1,
      updated_at = now()
  RETURNING successful_lookups INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_public_teaser_hiring_contact_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_public_teaser_hiring_contact_usage(uuid) TO service_role;
