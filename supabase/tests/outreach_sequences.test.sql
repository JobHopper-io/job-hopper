-- Checks for 20261124140000_outreach_sequences.sql. Rolled back:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/migrations/20261124130000_reply_handling.sql \
--     -f supabase/migrations/20261124140000_outreach_sequences.sql \
--     -f supabase/tests/outreach_sequences.test.sql -c 'rollback'

insert into public.institutional_leads (id, organization_name, source, category, contact_email) values
  ('00000000-0000-4000-8000-0000000006a1', 'Outreach Test U', 'seed_outreach', 'university', 'Dean@OutreachU.test'),
  ('00000000-0000-4000-8000-0000000006a2', 'Excluded Co', 'seed_outreach', 'employer', 'hr@excluded.test');
insert into public.exclusion_lists (company_name) values ('  excluded co ');
insert into public.prospects (id, kind, email, source, consent_status, country, status) values
  ('00000000-0000-4000-8000-0000000006b1', 'job_seeker', 'seeker@outreach.test', 'seed_outreach', 'legitimate_interest', 'US', 'new'),
  ('00000000-0000-4000-8000-0000000006b2', 'job_seeker', 'abroad@outreach.test', 'seed_outreach', 'legitimate_interest', 'CA', 'new');

do $$
declare
  lead uuid := '00000000-0000-4000-8000-0000000006a1';
  pr uuid := '00000000-0000-4000-8000-0000000006b1';
  s jsonb;
  n int;
begin
  -- subjects: prospect-only rows allowed, no subject rejected
  insert into public.followup_sequences (prospect_id, sequence_key, sequence_stage, scheduled_date)
  values (pr, 'outreach_demo', 1, now());
  insert into public.followup_sequences (institutional_lead_id, sequence_key, sequence_stage, scheduled_date)
  values (lead, 'outreach_demo', 1, now());
  begin
    insert into public.followup_sequences (sequence_key, sequence_stage, scheduled_date) values ('outreach_demo', 1, now());
    raise exception 'row without a subject accepted';
  exception when check_violation then null;
  end;
  -- one row per (subject, sequence, stage)
  begin
    insert into public.followup_sequences (prospect_id, sequence_key, sequence_stage, scheduled_date) values (pr, 'outreach_demo', 1, now());
    raise exception 'duplicate prospect stage accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.followup_sequences (institutional_lead_id, sequence_key, sequence_stage, scheduled_date) values (lead, 'outreach_demo', 1, now());
    raise exception 'duplicate lead stage accepted';
  exception when unique_violation then null;
  end;
  update public.followup_sequences set stop_reason = 'signed_up' where prospect_id = pr;
  update public.followup_sequences set stop_reason = 'converted' where prospect_id = pr;
  update public.followup_sequences set stop_reason = null where prospect_id = pr;
  raise notice 'PASS followup_sequences: prospect subject, per-subject unique stages, signed_up/converted';

  -- atomic claim: the second conditional update wins nothing
  update public.followup_sequences set claimed_at = now() where prospect_id = pr and claimed_at is null and sent_date is null;
  get diagnostics n = row_count;
  assert n = 1, 'first claim';
  update public.followup_sequences set claimed_at = now() where prospect_id = pr and claimed_at is null and sent_date is null;
  get diagnostics n = row_count;
  assert n = 0, 'second claim';
  raise notice 'PASS claimed_at: only one claim succeeds';

  assert (select not outreach_auto_send and outreach_max_per_run = 25 from public.growth_settings where id = 1), 'settings defaults';
  raise notice 'PASS growth_settings outreach defaults';

  -- clean lead / prospect
  s := public.outreach_send_state(lead, null, now() - interval '1 day');
  assert (s->>'exists')::boolean and s->>'email' = 'dean@outreachu.test' and s->>'ineligible_reason' is null, 'lead clean ' || s::text;
  assert not (s->>'replied')::boolean and not (s->>'signed_up')::boolean and not (s->>'unsubscribed')::boolean, 'lead flags';
  s := public.outreach_send_state(null, pr, now() - interval '1 day');
  assert s->>'ineligible_reason' is null and s->>'email' = 'seeker@outreach.test', 'prospect clean ' || s::text;
  -- eligibility
  assert public.outreach_send_state('00000000-0000-4000-8000-0000000006a2', null, now())->>'ineligible_reason' = 'exclusion_lists', 'excluded lead';
  assert public.outreach_send_state(null, '00000000-0000-4000-8000-0000000006b2', now())->>'ineligible_reason' = 'non_us', 'non-US prospect';
  raise notice 'PASS outreach_send_state: clean subjects, exclusion_lists, prospect eligibility';

  -- replies: only since the sequence started, matched by lead, prospect or address
  insert into public.reply_events (from_email, institutional_lead_id, received_at) values ('other@x.test', lead, now() - interval '3 days');
  assert not (public.outreach_send_state(lead, null, now() - interval '1 day')->>'replied')::boolean, 'old reply ignored';
  insert into public.reply_events (from_email, received_at) values ('DEAN@outreachu.test', now());
  assert (public.outreach_send_state(lead, null, now() - interval '1 day')->>'replied')::boolean, 'reply by address';
  insert into public.reply_events (from_email, prospect_id, received_at) values ('x@y.test', pr, now());
  assert (public.outreach_send_state(null, pr, now() - interval '1 day')->>'replied')::boolean, 'reply by prospect';
  raise notice 'PASS replied since start';

  -- suppression reasons
  insert into public.suppressed_emails (email_normalized, reason, scope, source) values
    ('dean@outreachu.test', 'hard_bounce', 'all', 'test'), ('dean@outreachu.test', 'spam_complaint', 'all', 'test');
  s := public.outreach_send_state(lead, null, now());
  assert (s->>'bounced')::boolean and (s->>'complained')::boolean and not (s->>'unsubscribed')::boolean, 'bounce/complaint';
  insert into public.suppressed_emails (email_normalized, reason, scope, source) values ('seeker@outreach.test', 'unsubscribe', 'marketing', 'test');
  s := public.outreach_send_state(null, pr, now());
  assert (s->>'unsubscribed')::boolean and s->>'ineligible_reason' = 'suppressed', 'unsubscribed prospect';
  raise notice 'PASS suppression flags';

  -- outreach / recovery recency by address
  insert into public.email_events (type, status, campaign, to_email_normalized, sent_at, institutional_lead_id) values
    ('outbound', 'sent', 'outreach_demo_s1', 'dean@outreachu.test', now() - interval '1 day', lead),
    ('outbound', 'failed', 'outreach_demo_s2', 'dean@outreachu.test', now(), lead),
    ('outbound', 'sent', 'first-batch', 'dean@outreachu.test', now(), lead),
    ('recovery', 'sent', 'recovery_cancelled_s1', 'dean@outreachu.test', now() - interval '3 hours', null);
  s := public.outreach_send_state(lead, null, now());
  assert (s->>'last_outreach_at')::timestamptz < now() - interval '23 hours', 'failed and non-outreach sends ignored';
  assert (s->>'last_recovery_at')::timestamptz > now() - interval '4 hours', 'last recovery';
  raise notice 'PASS last_outreach_at / last_recovery_at';
end $$;

-- signed up + paid, and recovery's recent_outreach
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000006c1', 'seeker@outreach.test', '{}');
insert into public.subscriptions (stripe_subscription_id, profile_id, status)
select 'sub_outreach', id, 'active' from public.profiles where email = 'seeker@outreach.test';
insert into public.email_events (type, status, campaign, to_email_normalized, sent_at, prospect_id)
values ('outbound', 'sent', 'outreach_demo_s1', 'seeker@outreach.test', now() - interval '1 day', '00000000-0000-4000-8000-0000000006b1');

do $$
declare
  s jsonb := public.outreach_send_state(null, '00000000-0000-4000-8000-0000000006b1', now());
  pid uuid := (select id from public.profiles where email = 'seeker@outreach.test');
begin
  assert (s->>'signed_up')::boolean and (s->>'paid')::boolean, 'signed up and paid ' || s::text;
  assert (public.recovery_send_state(pid)->>'recent_outreach')::boolean, 'recovery sees recent outreach';
  update public.email_events set sent_at = now() - interval '3 days' where to_email_normalized = 'seeker@outreach.test';
  assert not (public.recovery_send_state(pid)->>'recent_outreach')::boolean, 'older than 2 days';
  raise notice 'PASS signed_up/paid; recovery_send_state.recent_outreach';
end $$;

-- deleting a prospect removes its sequence rows (no orphan rows without a subject)
delete from public.prospects where id = '00000000-0000-4000-8000-0000000006b1';
do $$
begin
  assert not exists (select 1 from public.followup_sequences where sequence_key = 'outreach_demo' and institutional_lead_id is null), 'cascade';
  raise notice 'PASS prospect delete cascades';
end $$;

do $$
begin
  set local role authenticated;
  begin
    perform public.outreach_send_state(null, null, now());
    raise exception 'authenticated could call outreach_send_state';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS service_role only';
end $$;
