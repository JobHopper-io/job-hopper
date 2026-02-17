-- Remove clients table and client_status enum (legacy template; not used by current app).

DROP TABLE IF EXISTS public.clients CASCADE;
DROP TYPE IF EXISTS public.client_status CASCADE;
