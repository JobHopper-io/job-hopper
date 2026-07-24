-- landing_path: first-touch attribution, set once by handle_new_user() from auth
-- metadata at signup; never client-editable afterward (not in ProfileUserEditable).
alter table public.profiles add column if not exists landing_path text;

create table if not exists public.seo_page_views (
  url_path text not null,
  day date not null,
  views integer not null default 0,
  primary key (url_path, day)
);

alter table public.seo_page_views enable row level security;
grant all on public.seo_page_views to service_role;

-- Atomic upsert-increment with the required existence guard folded in: a bogus
-- url_path (not a real seo_pages row) silently no-ops instead of writing junk rows.
-- Called only by the service-role client in log-seo-page-view, so no anon/authenticated
-- grant is needed.
create or replace function public.increment_seo_page_view(p_url_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.seo_pages where url_path = p_url_path) then
    return;
  end if;

  insert into public.seo_page_views (url_path, day, views)
  values (p_url_path, current_date, 1)
  on conflict (url_path, day)
  do update set views = seo_page_views.views + 1;
end;
$$;

-- Re-create handle_new_user() with landing_path added to the INSERT (full body
-- copied from 20260220120000_subscription_overhaul_drop_old.sql plus one column).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  meta_phone text;
  normalized_phone text;
begin
  meta_phone := trim(coalesce(new.raw_user_meta_data->>'phone_number', ''));
  if meta_phone <> '' then
    normalized_phone := regexp_replace(meta_phone, '[^0-9]', '', 'g');
    if length(normalized_phone) < 10 then
      normalized_phone := null;
    end if;
  else
    normalized_phone := null;
  end if;

  insert into public.profiles (auth_user_id, first_name, last_name, email, phone_number, landing_path)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email,
    normalized_phone,
    new.raw_user_meta_data->>'landing_path'
  );

  return new;
end;
$$;
