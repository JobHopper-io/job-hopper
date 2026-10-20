-- University licenses are pay-first: a new org account starts as 'pending_payment' and
-- only becomes 'active' once its first Stripe invoice is paid (stripe-webhook
-- invoice.paid, with partner-portal's overview as a fallback that checks Stripe). Every
-- entitlement path already requires status = 'active' (claim_partner_seat,
-- org_account_is_live, resolveBaseTier, daily-job-matching, the client's orgAccount), so
-- no seat can be claimed or used before the university has paid.
alter table public.org_accounts
  drop constraint org_accounts_status_check,
  add constraint org_accounts_status_check check (status in ('pending_payment', 'active', 'canceled'));
