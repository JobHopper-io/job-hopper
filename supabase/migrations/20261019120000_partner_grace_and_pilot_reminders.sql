-- University partners: a grace period for overdue license invoices, and pilot-ending
-- reminders.

-- 1. When a subscription went past_due. Maintained by trigger because three writers set
--    status (stripe-webhook, reconcile-subscriptions, admin-stripe-reconcile); a trigger
--    can't be forgotten by one of them. Cleared as soon as it's no longer past_due.
alter table public.subscriptions
  add column past_due_since timestamptz;

create or replace function public.track_subscription_past_due()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'past_due' then
    new.past_due_since := case
      when tg_op = 'UPDATE' and old.status = 'past_due' then coalesce(old.past_due_since, now())
      else now()
    end;
  else
    new.past_due_since := null;
  end if;
  return new;
end;
$$;

create trigger subscriptions_track_past_due
  before insert or update of status on public.subscriptions
  for each row execute function public.track_subscription_past_due();

-- Rows already past_due: the real transition time was never recorded, so the grace
-- clock starts now.
update public.subscriptions set past_due_since = now() where status = 'past_due';

-- 2. Does a paid university license currently grant access? Universities pay by purchase
--    order and are routinely late, so an overdue invoice keeps students' access for a
--    30-day grace period instead of cutting them off the day it's due. The single
--    definition used by resolveBaseTier (_shared/base-tier.ts), daily-job-matching and
--    the partner dashboards (LICENSE_GRACE_DAYS in partner-portal mirrors the 30).
create or replace function public.org_account_is_live(p_org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from org_accounts o
    join subscriptions s on s.id = o.subscription_id
    where o.id = p_org_id
      and o.status = 'active'
      and (
        s.status in ('trial', 'active')
        or (s.status = 'past_due' and s.past_due_since > now() - interval '30 days')
      )
  );
$$;

revoke execute on function public.org_account_is_live(uuid) from public, anon, authenticated;
grant execute on function public.org_account_is_live(uuid) to service_role;

-- 3. Pilot-ending reminders (partner-pilot-reminders): each one is sent at most once.
alter table public.trial_grants
  add column reminder_14d_sent_at timestamptz,
  add column reminder_3d_sent_at timestamptz,
  add column ended_notice_sent_at timestamptz;

-- Start the daily chain (it re-enqueues itself, like daily-job-matching).
insert into public.scheduled_jobs (function_name, payload, run_at)
values ('partner-pilot-reminders', '{}'::jsonb, now() + interval '5 minutes');
