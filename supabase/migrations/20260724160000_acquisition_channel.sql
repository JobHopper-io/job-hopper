-- utm_source: first-touch paid/campaign attribution, same semantics as landing_path
-- (20260724150000_seo_page_performance.sql) - set once by handle_new_user() from auth
-- metadata at signup, never client-editable afterward (not in ProfileUserEditable).
alter table public.profiles add column if not exists utm_source text;

-- Re-create handle_new_user() with utm_source added (full body copied from
-- 20260724150000_seo_page_performance.sql plus one column).
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

  insert into public.profiles (auth_user_id, first_name, last_name, email, phone_number, landing_path, utm_source)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email,
    normalized_phone,
    new.raw_user_meta_data->>'landing_path',
    new.raw_user_meta_data->>'utm_source'
  );

  return new;
end;
$$;
