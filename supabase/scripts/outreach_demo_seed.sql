-- LOCAL ONLY. Fake @example.test people for the outreach-sequence demo
-- (docs/growth/day5-demo.md). Remove with outreach_demo_cleanup.sql.
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -f supabase/scripts/outreach_demo_seed.sql
--
-- L1 lead      replies after stage 2            -> stopped 'reply'
-- P1 prospect  unsubscribes after stage 2       -> stopped 'unsubscribed'
-- L2 lead, P2 prospect: two runs at the same time -> each email once
-- P3 prospect  its runs are skipped for 4 days  -> one catch-up email, not two

begin;

do $$ begin
  if exists (select 1 from public.institutional_leads where source = 'demo_outreach')
     or exists (select 1 from public.prospects where source = 'demo_outreach') then
    raise exception 'outreach demo already seeded; run outreach_demo_cleanup.sql first';
  end if;
end $$;

insert into public.institutional_leads
  (organization_name, source, category, status, opportunity_score, contact_email, decision_maker_name, student_size, recommended_package)
values
  ('Demo Outreach University', 'demo_outreach', 'university', 'new', 90, 'l1-dean@example.test', 'Pat Lee', 24000, '500+ seat custom cohort'),
  ('Demo Second College', 'demo_outreach', 'university', 'new', 80, 'l2-dean@example.test', 'Sam Ortiz', 8000, '100-499 seats');

insert into public.prospects
  (kind, source, email, first_name, target_job_title, country, consent_status, review_status, status)
values
  ('job_seeker', 'demo_outreach', 'p1-seeker@example.test', 'Maria', 'UX Designer', 'US', 'legitimate_interest', 'approved', 'new'),
  ('job_seeker', 'demo_outreach', 'p2-seeker@example.test', 'Dev', 'Data Analyst', 'US', 'legitimate_interest', 'approved', 'new'),
  ('job_seeker', 'demo_outreach', 'p3-seeker@example.test', 'Ana', null, 'US', 'legitimate_interest', 'approved', 'new');

commit;
