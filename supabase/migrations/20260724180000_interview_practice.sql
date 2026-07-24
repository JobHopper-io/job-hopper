-- Mock interview practice: one row per practice session on a specific job match, with the
-- running conversation stored in the exact OpenAI chat-message shape it gets replayed into
-- (no separate custom transcript schema).
create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  job_match_id uuid not null references public.job_matches(id) on delete cascade,
  resume_text text,
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.interview_sessions enable row level security;

-- SELECT only: writes happen exclusively via the interview-practice edge function's
-- service-role client (same as job_matches being admin-written, user-read).
create policy "Users can view their interview_sessions rows" on public.interview_sessions
  for select
  to authenticated
  using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

grant select on public.interview_sessions to authenticated;

-- Free-tier daily cap on practice questions (Core/Premium are unlimited and never call this).
create table public.interview_practice_daily_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  count int not null default 0,
  primary key (profile_id, usage_date)
);

alter table public.interview_practice_daily_usage enable row level security;
grant all on public.interview_practice_daily_usage to service_role;

-- Atomic per-day increment-with-cap, modeled on redeem_daily_resume_advice
-- (20260711120100_redeem_daily_resume_advice.sql) but stripped to just the counter -
-- no product/purchase/refund lifecycle needed for a practice-question quota.
create or replace function public.try_consume_interview_question(
  p_profile_id uuid,
  p_daily_limit int
)
returns table (ok boolean, used int, daily_limit int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_used int;
begin
  insert into public.interview_practice_daily_usage (profile_id, usage_date, count)
  values (p_profile_id, v_today, 1)
  on conflict (profile_id, usage_date)
  do update set count = interview_practice_daily_usage.count + 1
  where interview_practice_daily_usage.count < p_daily_limit
  returning count into v_used;

  if v_used is null then
    select coalesce(count, 0) into v_used
    from public.interview_practice_daily_usage
    where profile_id = p_profile_id and usage_date = v_today;

    return query select false, v_used, p_daily_limit;
    return;
  end if;

  return query select true, v_used, p_daily_limit;
end;
$$;

revoke all on function public.try_consume_interview_question(uuid, int) from public;
grant execute on function public.try_consume_interview_question(uuid, int) to service_role;
