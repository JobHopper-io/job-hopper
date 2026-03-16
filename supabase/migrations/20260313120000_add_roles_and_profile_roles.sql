-- Add roles and profile_roles tables for application-level roles (e.g. admin).
-- This migration is security-sensitive: role assignment must NOT be possible from the client.
-- Only service_role (or other privileged server-side code) can insert into profile_roles.
-- To assign the first admin manually after this migration:
--   INSERT INTO public.profile_roles (profile_id, role_id)
--   SELECT p.id, r.id
--   FROM public.profiles p
--   CROSS JOIN public.roles r
--   WHERE p.email = 'YOUR_ADMIN_EMAIL'
--     AND r.name = 'admin'
--   LIMIT 1;

-- 1. Roles table (global catalog of app roles)
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 2. profile_roles join table: which profiles have which roles
create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, role_id)
);

-- 3. Enable RLS where appropriate
alter table public.roles enable row level security;
alter table public.profile_roles enable row level security;

-- 4. Policies

-- 4.1 Roles: readable by authenticated users (for UI display); no client-side writes.
drop policy if exists "Authenticated can read roles" on public.roles;
create policy "Authenticated can read roles"
on public.roles
for select
to authenticated
using (true);

-- 4.2 profile_roles: users can read ONLY their own roles; writes are server-only.
drop policy if exists "Users can view own roles" on public.profile_roles;
create policy "Users can view own roles"
on public.profile_roles
for select
to authenticated
using (
  profile_id in (
    select id from public.profiles where auth_user_id = auth.uid()
  )
);

-- NOTE: No INSERT/UPDATE/DELETE policies are defined for authenticated on profile_roles.
-- This ensures that only service_role (which bypasses RLS) or SECURITY DEFINER functions
-- can grant or revoke roles.

-- 5. Seed a default admin role if it does not exist
insert into public.roles (name)
select 'admin'
where not exists (
  select 1 from public.roles where name = 'admin'
);

-- 6. Helper: check whether the current authenticated user has a given role by name.
create or replace function public.current_user_has_role(role_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  current_auth_id uuid;
  has_role boolean;
begin
  current_auth_id := auth.uid();

  if current_auth_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.profile_roles pr
    join public.profiles p on p.id = pr.profile_id
    join public.roles r on r.id = pr.role_id
    where p.auth_user_id = current_auth_id
      and r.name = role_name
  )
  into has_role;

  return coalesce(has_role, false);
end;
$$;

