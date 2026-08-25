-- Deliverability Monitoring (Build 07-08). Section 0 found Mailtrap already provides a
-- native bounce webhook (Sending API, Settings -> Webhooks) rather than requiring a
-- polling/parallel-tracking build. This migration just adds what's needed to actually
-- use it: a place to record the Mailtrap message_id for a successful send (so it can be
-- cross-referenced in Mailtrap's own log later) and the last failure reason for an
-- unsuccessful one -- directly on the lead row, no new table, since
-- institutional_leads.status/campaign + outbound_dry_run_log already serve as the audit
-- trail at this volume (per the build spec's own scoping).
alter table public.institutional_leads
  add column if not exists provider_message_id text,
  add column if not exists last_send_error text,
  add column if not exists last_send_attempted_at timestamptz;

-- 'bounced' joins the existing app-validated (no DB constraint) status vocabulary:
-- new, contacted, bounced. A bounced lead is excluded from future sends because the
-- live-send query only pulls status='new'; it never gets set back to 'new', so a bad
-- contact_email is never silently retried.
