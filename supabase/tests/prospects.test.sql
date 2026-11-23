-- Checks for 20261121130000_prospects.sql. Needs the earlier growth migrations applied.
-- Rolled back:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/migrations/20261121130000_prospects.sql \
--     -f supabase/tests/prospects.test.sql -c 'rollback'
--
-- Drop the migration -f once it's applied locally.

-- Dedupe: email_normalized (case/whitespace-insensitive) and (source, source_ref)
do $$
begin
  insert into public.prospects (kind, email, source, source_ref) values ('job_seeker', 'Dup@Example.com', 'reddit', 'r1');
  begin
    insert into public.prospects (kind, email, source, source_ref) values ('job_seeker', '  dup@example.COM ', 'linkedin', 'l1');
    raise exception 'FAIL: duplicate email accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.prospects (kind, email, source, source_ref) values ('job_seeker', 'other@example.com', 'reddit', 'r1');
    raise exception 'FAIL: duplicate (source, source_ref) accepted';
  exception when unique_violation then null;
  end;
  -- many prospects without an email, or without a source_ref, are fine
  insert into public.prospects (kind, source, source_ref) values ('job_seeker', 'reddit', 'r2'), ('job_seeker', 'reddit', 'r3');
  insert into public.prospects (kind, email, source) values ('job_seeker', '   ', 'manual'), ('job_seeker', null, 'manual');
  insert into public.prospects (kind, email, source) values ('job_seeker', 'a@x.com', 'manual'), ('job_seeker', 'b@x.com', 'manual');
  assert (select email_normalized from public.prospects where source = 'reddit' and source_ref = 'r1') = 'dup@example.com';
  assert (select count(*) from public.prospects where source = 'manual' and email_normalized is null) = 2, 'blank email should normalize to null';

  -- evidence: unique per (prospect, url); cascades with the prospect
  insert into public.prospect_evidence (prospect_id, url, snippet, found_at, source)
  select id, 'https://reddit.com/p/1', 'looking for H-1B sponsors', now(), 'reddit' from public.prospects where source_ref = 'r1';
  begin
    insert into public.prospect_evidence (prospect_id, url, found_at, source)
    select id, 'https://reddit.com/p/1', now(), 'reddit' from public.prospects where source_ref = 'r1';
    raise exception 'FAIL: duplicate evidence url accepted';
  exception when unique_violation then null;
  end;
  insert into public.prospect_evidence (prospect_id, url, found_at, source)
  select id, 'https://reddit.com/p/2', now(), 'reddit' from public.prospects where source_ref = 'r1';
  delete from public.prospects where source_ref = 'r1';
  assert not exists (select 1 from public.prospect_evidence where url like 'https://reddit.com/p/%'), 'evidence not cascaded';
  raise notice 'PASS dedupe (email, source+source_ref, evidence url)';
end;
$$;

-- Eligibility: one prospect per reason, plus eligible ones
insert into public.prospects (kind, email, source, source_ref, consent_status, country, do_not_contact) values
  ('job_seeker', null,                     'elig', 'no-email',   'opted_in',            'US', false),
  ('job_seeker', 'dnc@example.com',        'elig', 'dnc',        'opted_in',            'US', true),
  ('job_seeker', 'noconsent@example.com',  'elig', 'no-consent', 'none',                'US', false),
  ('job_seeker', 'optout@example.com',     'elig', 'opted-out',  'opted_out',           'US', false),
  ('job_seeker', 'canada@example.com',     'elig', 'non-us',     'opted_in',            'CA', false),
  ('job_seeker', 'nowhere@example.com',    'elig', 'unknown',    'opted_in',            null, false),
  ('job_seeker', 'blankcountry@example.com','elig','blank',      'opted_in',            '  ', false),
  ('job_seeker', 'suppressed@example.com', 'elig', 'suppressed', 'legitimate_interest', 'US', false),
  ('job_seeker', 'ok.li@example.com',      'elig', 'ok-li',      'legitimate_interest', 'US', false),
  ('job_seeker', 'ok.optin@example.com',   'elig', 'ok-optin',   'opted_in',            ' us ', false),
  ('job_seeker', 'txonly@example.com',     'elig', 'tx-only',    'opted_in',            'US', false);

do $$
declare
  rec record;
  expected jsonb := '{
    "no-email": "no_email", "dnc": "do_not_contact", "no-consent": "no_consent", "opted-out": "no_consent",
    "non-us": "non_us", "unknown": "unknown_country", "blank": "unknown_country", "suppressed": "suppressed",
    "ok-li": null, "ok-optin": null, "tx-only": null
  }';
begin
  perform public.suppress_email('suppressed@example.com', 'unsubscribe', 'marketing', 'test');
  -- a transactional-only suppression would need scope all; a bounce on another address is irrelevant
  perform public.suppress_email('someone.else@example.com', 'hard_bounce', 'all', 'test');

  for rec in
    select p.source_ref, e.ineligible_reason, e.eligible
    from public.prospect_send_eligibility e join public.prospects p on p.id = e.prospect_id
    where p.source = 'elig'
  loop
    assert rec.ineligible_reason is not distinct from (expected ->> rec.source_ref),
      format('%s: expected %s, got %s', rec.source_ref, expected ->> rec.source_ref, rec.ineligible_reason);
    assert rec.eligible = (rec.ineligible_reason is null), rec.source_ref || ': eligible flag';
  end loop;
  assert (select count(*) from public.prospect_send_eligibility e join public.prospects p on p.id = e.prospect_id
          where p.source = 'elig') = 11;

  -- suppression added later takes effect immediately (view is computed at read time)
  perform public.suppress_email('ok.li@example.com', 'spam_complaint', 'all', 'test');
  assert (select ineligible_reason from public.prospect_send_eligibility e join public.prospects p on p.id = e.prospect_id
          where p.source_ref = 'ok-li') = 'suppressed';
  raise notice 'PASS eligibility reasons (no_email, do_not_contact, no_consent x2, non_us, unknown_country x2, suppressed, eligible)';
end;
$$;

-- Signup links a matching prospect; signups without a match (or employers) still work
insert into public.prospects (kind, email, source, source_ref, status)
values ('job_seeker', 'Future.User@Example.com', 'reddit', 'signup-1', 'contacted'),
       ('job_seeker', 'hr@hiring.example', 'apollo', 'signup-emp', 'new');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a9', ' future.user@example.com', '{"first_name":"Future"}'),
  ('00000000-0000-4000-8000-0000000000aa', 'nobody.matches@example.com', '{"first_name":"Nobody"}'),
  ('00000000-0000-4000-8000-0000000000ab', 'hr@hiring.example', '{"account_type":"employer","company_name":"Hiring Co"}');

do $$
declare
  v_profile uuid := (select id from public.profiles where auth_user_id = '00000000-0000-4000-8000-0000000000a9');
begin
  assert v_profile is not null, 'signup with a matching prospect failed';
  assert (select profile_id from public.prospects where source_ref = 'signup-1') = v_profile, 'prospect not linked';
  assert (select status from public.prospects where source_ref = 'signup-1') = 'converted', 'prospect not converted';

  assert exists (select 1 from public.profiles where auth_user_id = '00000000-0000-4000-8000-0000000000aa'),
    'signup without a matching prospect failed';

  assert exists (select 1 from public.employer_accounts where auth_user_id = '00000000-0000-4000-8000-0000000000ab'), 'employer signup failed';
  assert (select profile_id from public.prospects where source_ref = 'signup-emp') is null, 'employer signup linked a prospect';
  assert (select status from public.prospects where source_ref = 'signup-emp') = 'new';
  raise notice 'PASS signup links a matching prospect; no match and employer signups unaffected';
end;
$$;

-- prospect_id on email_events / reply_events / lead_scores; access
do $$
declare
  v_prospect uuid := (select id from public.prospects where source_ref = 'ok-optin');
begin
  insert into public.email_events (type, status, prospect_id, to_email_normalized) values ('outbound', 'sent', v_prospect, 'ok.optin@example.com');
  insert into public.reply_events (from_email, prospect_id) values ('ok.optin@example.com', v_prospect);
  insert into public.lead_scores (prospect_id, intent_score) values (v_prospect, 42);
  begin
    insert into public.email_events (type, status, prospect_id) values ('outbound', 'sent', gen_random_uuid());
    raise exception 'FAIL: email_events.prospect_id FK missing';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.lead_scores (intent_score) values (1);
    raise exception 'FAIL: lead_scores without a subject accepted';
  exception when check_violation then null;
  end;
  delete from public.prospects where id = v_prospect;
  assert (select prospect_id from public.email_events where to_email_normalized = 'ok.optin@example.com') is null, 'email_events not set null';
  assert (select prospect_id from public.reply_events where from_email = 'ok.optin@example.com') is null, 'reply_events not set null';
  assert not exists (select 1 from public.lead_scores where intent_score = 42), 'lead_scores not cascaded';

  assert not has_table_privilege('anon', 'public.prospects', 'select');
  assert not has_table_privilege('authenticated', 'public.prospects', 'select');
  assert not has_table_privilege('authenticated', 'public.prospect_evidence', 'select');
  assert not has_table_privilege('authenticated', 'public.prospect_send_eligibility', 'select');
  assert not has_table_privilege('anon', 'public.prospect_send_eligibility', 'select');
  assert has_table_privilege('service_role', 'public.prospect_send_eligibility', 'select');
  assert (select relrowsecurity from pg_class where oid = 'public.prospects'::regclass);
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('prospects', 'prospect_evidence'));
  raise notice 'PASS FKs (email_events, reply_events, lead_scores) and service-role-only access';
end;
$$;

-- A failure while linking must never block signup: force the prospects update to throw.
create function pg_temp.boom() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end; $$;
create trigger boom before update on public.prospects for each row execute function pg_temp.boom();
insert into public.prospects (kind, email, source, source_ref) values ('job_seeker', 'unlucky@example.com', 'reddit', 'signup-fail');
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-0000000000ac', 'unlucky@example.com', '{"first_name":"Unlucky"}');
do $$
begin
  assert exists (select 1 from public.profiles where auth_user_id = '00000000-0000-4000-8000-0000000000ac'), 'signup blocked by a linking failure';
  assert (select profile_id from public.prospects where source_ref = 'signup-fail') is null;
  raise notice 'PASS linking failure does not block signup';
end;
$$;
drop trigger boom on public.prospects;
