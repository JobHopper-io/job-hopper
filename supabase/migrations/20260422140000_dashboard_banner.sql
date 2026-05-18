-- Singleton row (id = 1): temporary dashboard message with optional visibility window.
-- All authenticated users may read; only admin/super_admin may update (via RLS).

create table if not exists public.dashboard_banner (
  id smallint primary key default 1,
  message text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint dashboard_banner_singleton_chk check (id = 1)
);

insert into public.dashboard_banner (id) values (1)
on conflict (id) do nothing;

create or replace function public.set_dashboard_banner_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_dashboard_banner_updated_at on public.dashboard_banner;

create trigger set_dashboard_banner_updated_at
before update on public.dashboard_banner
for each row
execute function public.set_dashboard_banner_updated_at();

alter table public.dashboard_banner enable row level security;

drop policy if exists "Authenticated can read dashboard_banner" on public.dashboard_banner;
create policy "Authenticated can read dashboard_banner"
on public.dashboard_banner
for select
to authenticated
using (true);

drop policy if exists "Admins can update dashboard_banner" on public.dashboard_banner;
create policy "Admins can update dashboard_banner"
on public.dashboard_banner
for update
to authenticated
using (
  public.current_user_has_role('admin')
  or public.current_user_has_role('super_admin')
)
with check (
  public.current_user_has_role('admin')
  or public.current_user_has_role('super_admin')
);

grant select, update on public.dashboard_banner to authenticated;
grant all on public.dashboard_banner to service_role;
