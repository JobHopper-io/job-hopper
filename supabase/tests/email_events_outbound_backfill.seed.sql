-- Fixtures for email_events_outbound_backfill.test.sql (run before the backfill migration).
insert into public.institutional_leads (organization_name, source, category, status, contact_email, provider_message_id, campaign, last_send_attempted_at, opportunity_score) values
  ('BF One U',          'seed_bf', 'university', 'contacted', ' One@Uni.edu ',  'bf-1', 'camp-1', '2026-09-01 12:00+00', 70),
  ('BF Bounce U',       'seed_bf', 'university', 'bounced',   'dead@uni.edu',   'bf-2', 'camp-1', '2026-09-01 12:05+00', 70),
  ('BF Merged Main',    'seed_bf', 'university', 'contacted', 'shared@uni.edu', 'bf-3', 'camp-2', '2026-09-02 12:00+00', 90),
  ('BF Merged Branch',  'seed_bf', 'university', 'contacted', 'shared@uni.edu', 'bf-3', 'camp-2', '2026-09-02 12:00+00', 60),
  ('BF NoMsg U',        'seed_bf', 'employer',   'contacted', 'nomsg@corp.com', null,   'camp-2', '2026-09-03 12:00+00', 55),
  ('BF Logged U',       'seed_bf', 'university', 'contacted', 'logged@uni.edu', 'bf-5', 'camp-3', '2026-11-20 12:00+00', 50),
  ('BF New U',          'seed_bf', 'university', 'new',       'new@uni.edu',    null,   null,     null,                  50),
  ('BF Dead U',         'seed_bf', 'university', 'dead',      'gone@uni.edu',   'bf-7', 'camp-1', '2026-09-01 12:00+00', 50);

-- bf-5 was already logged by the live send
insert into public.email_events (type, status, provider_message_id, campaign, to_email_normalized, institutional_lead_id)
select 'outbound', 'delivered', 'bf-5', 'camp-3', 'logged@uni.edu', id from public.institutional_leads where organization_name = 'BF Logged U';
