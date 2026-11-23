-- Unsubscribe writers for suppressed_emails (growth step 2a, docs/growth/lead-system-design.md §5).
--
-- suppress_email() is the one write path into suppressed_emails: idempotent on
-- (email_normalized, reason), and a repeat can only widen scope (marketing -> all),
-- never narrow it. apply_unsubscribe() backs the unsubscribe-email edge function;
-- set_own_email_unsubscribed() backs the profile page's "unsubscribe from all" toggle.

create or replace function public.suppress_email(
  p_email text,
  p_reason text,
  p_scope text,
  p_source text,
  p_profile_id uuid default null,
  p_provider_event_id text default null
)
returns void
language sql
set search_path = public
as $$
  insert into public.suppressed_emails (email_normalized, reason, scope, source, profile_id, provider_event_id)
  values (public.normalize_email(p_email), p_reason, p_scope, p_source, p_profile_id, p_provider_event_id)
  on conflict (email_normalized, reason) do update
    set scope = 'all'
    where suppressed_emails.scope <> 'all' and excluded.scope = 'all';
$$;

revoke execute on function public.suppress_email(text, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.suppress_email(text, text, text, text, uuid, text) to service_role;

-- Called by unsubscribe-email with a verified token. p_email is null for v1 tokens
-- (profile id only), so the address is looked up from the profile. Scope 'all' with a
-- profile also sets notification_settings.email_unsubscribed_at, keeping the earliest
-- timestamp so a repeat POST changes nothing. Returns the normalized address.
create or replace function public.apply_unsubscribe(
  p_email text,
  p_scope text,
  p_profile_id uuid,
  p_source text
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_email text := p_email;
begin
  if v_email is null and p_profile_id is not null then
    select email into v_email from public.profiles where id = p_profile_id;
  end if;
  if v_email is null or public.normalize_email(v_email) = '' then
    raise exception 'apply_unsubscribe: no email for this token';
  end if;

  perform public.suppress_email(v_email, 'unsubscribe', p_scope, p_source, p_profile_id);

  if p_scope = 'all' and p_profile_id is not null then
    insert into public.notification_settings (profile_id, email_unsubscribed_at, updated_at)
    select p_profile_id, now(), now()
    where exists (select 1 from public.profiles where id = p_profile_id)
    on conflict (profile_id) do update
      set email_unsubscribed_at = coalesce(notification_settings.email_unsubscribed_at, now()),
          updated_at = case when notification_settings.email_unsubscribed_at is null then now()
                            else notification_settings.updated_at end;
  end if;

  return public.normalize_email(v_email);
end;
$$;

revoke execute on function public.apply_unsubscribe(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.apply_unsubscribe(text, text, uuid, text) to service_role;

-- Profile page toggle for the signed-in user. Unsubscribing writes a scope 'all' row
-- with source 'profile'. Re-enabling deletes the user's own reason 'unsubscribe' +
-- scope 'all' rows from any source (profile toggle or an email footer link), so the
-- account owner can always opt back in. It never deletes hard_bounce / spam_complaint /
-- manual rows, nor scope 'marketing' rows (marketing opt-in comes later through consent).
create or replace function public.set_own_email_unsubscribed(p_unsubscribed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_email text;
begin
  select id, email into v_profile_id, v_email from public.profiles where auth_user_id = auth.uid();
  if v_profile_id is null then
    raise exception 'set_own_email_unsubscribed: no profile for the current user';
  end if;

  insert into public.notification_settings (profile_id, email_unsubscribed_at, updated_at)
  values (v_profile_id, case when p_unsubscribed then now() end, now())
  on conflict (profile_id) do update
    set email_unsubscribed_at = case when p_unsubscribed
                                     then coalesce(notification_settings.email_unsubscribed_at, now())
                                end,
        updated_at = now();

  if p_unsubscribed then
    perform public.suppress_email(v_email, 'unsubscribe', 'all', 'profile', v_profile_id);
  else
    delete from public.suppressed_emails
    where email_normalized = public.normalize_email(v_email)
      and reason = 'unsubscribe'
      and scope = 'all';
  end if;
end;
$$;

revoke execute on function public.set_own_email_unsubscribed(boolean) from public, anon;
grant execute on function public.set_own_email_unsubscribed(boolean) to authenticated;
