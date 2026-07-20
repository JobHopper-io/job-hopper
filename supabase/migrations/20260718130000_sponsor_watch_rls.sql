-- D51-55: sponsor_watch_subscriptions/sponsor_watch_events landed in the original D31-35 schema
-- migration (20260716200000) with RLS enabled and ZERO policies, ZERO grants - same shape as the
-- employers/employer_sponsorship_scores bug caught during D46-50's browser testing
-- (20260717180000 + 20260718120000). Fixed here from the start rather than repeating it.
--
-- sponsor_watch_subscriptions: users manage their own subscriptions directly (subscribe/
-- unsubscribe from the frontend), so it needs full CRUD for authenticated - same shape as
-- job_applications (20260711120600). No update policy: a subscription is either present or
-- absent, nothing on the row itself is user-editable.
--
-- sponsor_watch_events: NOT exposed to the frontend. Users learn about events via email, not an
-- in-app feed (out of scope for this pass - see docs/sponsorship-data-engine.md D51-55). Written
-- only by the sponsor-watch-check edge function (service_role), same access shape as
-- scheduled_jobs (20260226100000): RLS enabled, no policies for anon/authenticated.

create policy "Users can view their sponsor_watch_subscriptions rows"
on public.sponsor_watch_subscriptions
for select
to authenticated
using (
  profile_id in (select id from public.profiles where auth_user_id = auth.uid())
);

create policy "Users can insert their sponsor_watch_subscriptions rows"
on public.sponsor_watch_subscriptions
for insert
to authenticated
with check (
  profile_id in (select id from public.profiles where auth_user_id = auth.uid())
);

create policy "Users can delete their sponsor_watch_subscriptions rows"
on public.sponsor_watch_subscriptions
for delete
to authenticated
using (
  profile_id in (select id from public.profiles where auth_user_id = auth.uid())
);

grant select, insert, delete on public.sponsor_watch_subscriptions to authenticated;

grant select, insert, update on public.sponsor_watch_events to service_role;
