-- Growth step 4 (docs/growth/lead-system-design.md §3): consent storage.
--
--   consent_wordings            the exact text a person saw, by version
--   accepted_marketing_wordings which wording versions count as marketing consent
--   consent_records             append-only log; current state = latest row per subject + purpose
--
-- Whether the legacy bundled signup checkbox counts as marketing consent is undecided, so
-- it is recorded (backfill) but NOT accepted. If it's decided that it counts, that's one
-- insert into accepted_marketing_wordings, no code change.

-- ---------------------------------------------------------------------------
-- consent_wordings
-- ---------------------------------------------------------------------------
create table public.consent_wordings (
  version text primary key,
  purpose text not null check (purpose in ('marketing', 'job_alerts', 'product_updates')),
  channel text not null check (channel in ('email', 'sms')),
  text text not null,
  effective_at timestamptz not null default now()
);

alter table public.consent_wordings enable row level security;
revoke all on table public.consent_wordings from anon, authenticated;
grant select, insert on table public.consent_wordings to service_role;

insert into public.consent_wordings (version, purpose, channel, text, effective_at) values
  ('legacy_bundled_v0', 'marketing', 'email',
   'I agree to receive account and marketing emails from Job-Hopper. Unsubscribe anytime.',
   '2026-07-29 13:07:52+00'),
  ('marketing_email_v1', 'marketing', 'email',
   'Send me job search tips, product news and offers by email. Optional. Unsubscribe anytime.',
   now()),
  ('sms_v1', 'job_alerts', 'sms',
   'By checking this box, you agree to receive account and job match alert SMS messages from Job-Hopper. You can reply stop to opt-out at any time. Reply help to 216-759-2519. Messages and data rates may apply. Message frequency will vary. You can review our Privacy Policy and Terms & Conditions.',
   '2026-07-29 13:07:52+00');

-- ---------------------------------------------------------------------------
-- accepted_marketing_wordings
-- ---------------------------------------------------------------------------
create table public.accepted_marketing_wordings (
  wording_version text primary key references public.consent_wordings (version),
  accepted_at timestamptz not null default now(),
  note text
);

alter table public.accepted_marketing_wordings enable row level security;
revoke all on table public.accepted_marketing_wordings from anon, authenticated;
-- current_marketing_consent() runs as the caller, so signed-in users need to read this list.
grant select on table public.accepted_marketing_wordings to authenticated;
grant select, insert, delete on table public.accepted_marketing_wordings to service_role;
create policy "Authenticated can read accepted marketing wordings"
on public.accepted_marketing_wordings for select to authenticated using (true);

insert into public.accepted_marketing_wordings (wording_version, note)
values ('marketing_email_v1', 'Separate, optional, unticked marketing opt-in (2026-11).');

-- ---------------------------------------------------------------------------
-- consent_records (append-only)
-- ---------------------------------------------------------------------------
create table public.consent_records (
  -- bigint identity, not uuid: "latest row" needs a strict order even for rows written
  -- in the same transaction (same captured_at).
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  -- set null, not cascade: deleting a profile must not erase the consent history.
  profile_id uuid references public.profiles (id) on delete set null,
  -- Person-level lead (public.prospects, design step 5). No FK until that table exists.
  prospect_id uuid,
  email_normalized text not null
    check (email_normalized <> '' and email_normalized = public.normalize_email(email_normalized)),
  channel text not null check (channel in ('email', 'sms')),
  purpose text not null check (purpose in ('marketing', 'job_alerts', 'product_updates')),
  granted boolean not null,
  -- The wording shown when consent was given. Null only for a revoke (unsubscribe /
  -- toggle off), which isn't a response to any wording.
  wording_version text references public.consent_wordings (version),
  source text not null,
  landing_path text,
  utm_source text,
  utm_campaign text,
  constraint consent_records_grant_has_wording check (not granted or wording_version is not null)
);

create index consent_records_profile_latest_idx on public.consent_records (profile_id, purpose, channel, id desc);
create index consent_records_email_latest_idx on public.consent_records (email_normalized, purpose, channel, id desc);

alter table public.consent_records enable row level security;
revoke all on table public.consent_records from anon, authenticated;
-- Append-only: nobody gets UPDATE / DELETE / TRUNCATE, including service_role.
revoke update, delete, truncate on table public.consent_records from service_role;
grant select, insert on table public.consent_records to service_role;
grant select on table public.consent_records to authenticated;

create policy "Users can read own consent_records"
on public.consent_records for select to authenticated
using (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Backfill: what happened at signup for existing users -- they ticked the bundled box.
-- Profiles with no auth user (billing contacts created by admin-org-accounts) never
-- signed up through the form, so they get no row. Not SMS.
-- ---------------------------------------------------------------------------
insert into public.consent_records (captured_at, profile_id, email_normalized, channel, purpose, granted, wording_version, source)
select coalesce(p.created_at, now()), p.id, public.normalize_email(p.email), 'email', 'marketing', true,
       'legacy_bundled_v0', 'backfill_legacy_signup'
from public.profiles p
where p.auth_user_id is not null
  and public.normalize_email(p.email) <> ''
order by p.created_at nulls first, p.id;

-- ---------------------------------------------------------------------------
-- Signup: record what the form sent. A separate trigger from handle_new_user(), named to
-- fire after on_auth_user_created (same-event triggers fire in name order), so the
-- profile exists and handle_new_user() itself is untouched.
--
-- Never blocks a signup: no consent metadata (old clients, admin-created users), no
-- profile (employer signups), an unknown wording version, or any error -> no row, and
-- the signup proceeds. A missing row reads as "no marketing consent", the safe default.
-- ---------------------------------------------------------------------------
create or replace function public.record_signup_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_profile public.profiles%rowtype;
begin
  if not (v_meta ? 'marketing_email_consent' or v_meta ? 'sms_consent') then
    return new;
  end if;

  select * into v_profile from public.profiles where auth_user_id = new.id;
  if not found then
    return new;
  end if;

  begin
    if v_meta ? 'marketing_email_consent' and exists (
      select 1 from public.consent_wordings
      where version = v_meta ->> 'consent_wording_version' and purpose = 'marketing' and channel = 'email'
    ) then
      insert into public.consent_records
        (profile_id, email_normalized, channel, purpose, granted, wording_version, source, landing_path, utm_source, utm_campaign)
      values
        (v_profile.id, public.normalize_email(v_profile.email), 'email', 'marketing',
         (v_meta ->> 'marketing_email_consent')::boolean, v_meta ->> 'consent_wording_version',
         'signup_form', v_profile.landing_path, v_profile.utm_source, v_profile.utm_campaign);
    end if;

    if v_meta ? 'sms_consent' and exists (
      select 1 from public.consent_wordings
      where version = v_meta ->> 'sms_consent_wording_version' and channel = 'sms'
    ) then
      insert into public.consent_records
        (profile_id, email_normalized, channel, purpose, granted, wording_version, source, landing_path, utm_source, utm_campaign)
      values
        (v_profile.id, public.normalize_email(v_profile.email), 'sms', 'job_alerts',
         (v_meta ->> 'sms_consent')::boolean, v_meta ->> 'sms_consent_wording_version',
         'signup_form', v_profile.landing_path, v_profile.utm_source, v_profile.utm_campaign);
    end if;
  exception when others then
    raise warning 'record_signup_consent: consent not recorded for user %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function public.record_signup_consent() from public, anon, authenticated;

create trigger on_auth_user_created_record_consent
after insert on auth.users
for each row execute function public.record_signup_consent();

-- ---------------------------------------------------------------------------
-- current_marketing_consent: true only if the latest marketing email row is a grant
-- AND its wording is in accepted_marketing_wordings. Runs as the caller: service_role
-- sees every profile; a signed-in user only gets an answer for their own (RLS), and
-- false for anyone else.
-- ---------------------------------------------------------------------------
create or replace function public.current_marketing_consent(p_profile_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((
    select r.granted
       and exists (select 1 from public.accepted_marketing_wordings a where a.wording_version = r.wording_version)
    from public.consent_records r
    where r.profile_id = p_profile_id and r.purpose = 'marketing' and r.channel = 'email'
    order by r.id desc
    limit 1
  ), false);
$$;

revoke execute on function public.current_marketing_consent(uuid) from public, anon;
grant execute on function public.current_marketing_consent(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Profile toggle: append a marketing row for the signed-in user. Turning it on also
-- clears their scope-marketing unsubscribe (that's what an explicit opt-in is for);
-- turning it off adds one, so marketing sends stop at the send-time check too. A
-- scope-all unsubscribe ("unsubscribe from all") is left alone either way.
-- ---------------------------------------------------------------------------
create or replace function public.set_own_marketing_consent(p_granted boolean, p_wording_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if not found then
    raise exception 'set_own_marketing_consent: no profile for the current user';
  end if;
  if p_granted and not exists (
    select 1 from public.consent_wordings where version = p_wording_version and purpose = 'marketing' and channel = 'email'
  ) then
    raise exception 'set_own_marketing_consent: unknown marketing wording %', p_wording_version;
  end if;

  insert into public.consent_records (profile_id, email_normalized, channel, purpose, granted, wording_version, source)
  values (v_profile.id, public.normalize_email(v_profile.email), 'email', 'marketing', p_granted,
          case when p_granted then p_wording_version end, 'profile_settings');

  if p_granted then
    delete from public.suppressed_emails
    where email_normalized = public.normalize_email(v_profile.email)
      and reason = 'unsubscribe'
      and scope = 'marketing';
  else
    perform public.suppress_email(v_profile.email, 'unsubscribe', 'marketing', 'profile', v_profile.id);
  end if;
end;
$$;

revoke execute on function public.set_own_marketing_consent(boolean, text) from public, anon;
grant execute on function public.set_own_marketing_consent(boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- apply_unsubscribe (from 20261120130000), now also appending a marketing revoke for
-- scope marketing and scope all. A repeat POST adds no second revoke: one is only
-- appended when the latest marketing row for the address isn't already a revoke.
-- ---------------------------------------------------------------------------
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
  v_profile_id uuid := p_profile_id;
begin
  if v_email is null and p_profile_id is not null then
    select email into v_email from public.profiles where id = p_profile_id;
  end if;
  if v_email is null or public.normalize_email(v_email) = '' then
    raise exception 'apply_unsubscribe: no email for this token';
  end if;
  if v_profile_id is not null and not exists (select 1 from public.profiles where id = v_profile_id) then
    v_profile_id := null;
  end if;

  perform public.suppress_email(v_email, 'unsubscribe', p_scope, p_source, v_profile_id);

  if p_scope = 'all' and v_profile_id is not null then
    insert into public.notification_settings (profile_id, email_unsubscribed_at, updated_at)
    values (v_profile_id, now(), now())
    on conflict (profile_id) do update
      set email_unsubscribed_at = coalesce(notification_settings.email_unsubscribed_at, now()),
          updated_at = case when notification_settings.email_unsubscribed_at is null then now()
                            else notification_settings.updated_at end;
  end if;

  if coalesce((
    select r.granted
    from public.consent_records r
    where r.email_normalized = public.normalize_email(v_email) and r.purpose = 'marketing' and r.channel = 'email'
    order by r.id desc
    limit 1
  ), true) then
    insert into public.consent_records (profile_id, email_normalized, channel, purpose, granted, wording_version, source)
    values (v_profile_id, public.normalize_email(v_email), 'email', 'marketing', false, null, p_source);
  end if;

  return public.normalize_email(v_email);
end;
$$;

revoke execute on function public.apply_unsubscribe(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.apply_unsubscribe(text, text, uuid, text) to service_role;
