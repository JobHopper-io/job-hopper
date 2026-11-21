-- Checks for 20261122120000_prospect_intent_fields.sql. Rolled back; run without the seed
-- (outreach_leads absent, like local) and with it (present, like hosted):
--
--   psql ... -c 'begin' -f supabase/migrations/20261122120000_prospect_intent_fields.sql \
--     -f supabase/tests/prospect_intent_fields.test.sql -c 'rollback'
--   psql ... -c 'begin' -f supabase/tests/prospect_intent_fields.seed.sql \
--     -f supabase/migrations/20261122120000_prospect_intent_fields.sql \
--     -f supabase/tests/prospect_intent_fields.test.sql -c 'rollback'

do $$
begin
  assert (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'prospects'
            and column_name in ('segments', 'needs_sponsorship', 'intent_score', 'intent_reason', 'classified_at',
                                'classifier_model', 'review_status', 'reviewed_at', 'reviewed_by')) = 9, 'prospects columns';
  assert exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'prospect_evidence' and column_name = 'signal_type');
  assert exists (select 1 from pg_indexes where indexname = 'prospects_review_queue_idx'
                 and indexdef like '%(review_status, intent_score DESC)%'), 'review queue index';

  insert into public.prospects (kind, source, source_ref) values ('job_seeker', 'intent-test', '1');
  assert (select review_status from public.prospects where source = 'intent-test') = 'pending', 'default pending';
  begin
    update public.prospects set intent_score = 101 where source = 'intent-test';
    raise exception 'FAIL: intent_score 101 accepted';
  exception when check_violation then null;
  end;
  begin
    update public.prospects set review_status = 'maybe' where source = 'intent-test';
    raise exception 'FAIL: review_status maybe accepted';
  exception when check_violation then null;
  end;
  update public.prospects set intent_score = 0, review_status = 'approved', segments = array['swe', 'visa'] where source = 'intent-test';
  begin
    update public.prospects set reviewed_by = gen_random_uuid() where source = 'intent-test';
    raise exception 'FAIL: reviewed_by FK missing';
  exception when foreign_key_violation then null;
  end;
  raise notice 'PASS prospects intent/review columns, checks, FK, index';

  if to_regclass('public.outreach_leads') is not null then
    assert (select relrowsecurity from pg_class where oid = 'public.outreach_leads'::regclass), 'outreach_leads RLS off';
    assert not exists (select 1 from information_schema.role_table_grants
                       where table_schema = 'public' and table_name = 'outreach_leads' and grantee in ('anon', 'authenticated')),
      'outreach_leads still granted to anon/authenticated';
    assert obj_description('public.outreach_leads'::regclass) like 'Unused:%superseded%' or
           obj_description('public.outreach_leads'::regclass) like 'Unused:%Superseded%', 'outreach_leads comment';
    raise notice 'PASS outreach_leads locked down (RLS on, no anon/authenticated grants, comment)';
  else
    raise notice 'PASS outreach_leads absent: migration skipped it';
  end if;
end;
$$;
