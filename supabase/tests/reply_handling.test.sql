-- Checks for 20261124130000_reply_handling.sql. Rolled back:
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c 'begin' -f supabase/migrations/20261124130000_reply_handling.sql \
--     -f supabase/tests/reply_handling.test.sql -c 'rollback'

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-0000000005a1', 'owner@replies.test', '{"first_name":"Owner"}');

do $$
declare
  owner_id uuid := (select id from public.profiles where email = 'owner@replies.test');
  n int;
  r record;
begin
  -- Message-ID idempotency: the ingest's ON CONFLICT (message_id) DO NOTHING
  insert into public.reply_events (from_email, message_id) values ('a@replies.test', 'm-1@mail');
  insert into public.reply_events (from_email, message_id) values ('a@replies.test', 'm-1@mail')
    on conflict (message_id) do nothing;
  get diagnostics n = row_count;
  assert n = 0, 'duplicate message_id inserted';
  assert (select count(*) from public.reply_events where message_id = 'm-1@mail') = 1, 'one row per message_id';
  begin
    insert into public.reply_events (from_email, message_id) values ('a@replies.test', 'm-1@mail');
    raise exception 'plain duplicate insert accepted';
  exception when unique_violation then null;
  end;
  -- Replies without a Message-ID are all kept.
  insert into public.reply_events (from_email) values ('b@replies.test'), ('b@replies.test');
  assert (select count(*) from public.reply_events where from_email = 'b@replies.test' and message_id is null) = 2, 'null message_ids';
  raise notice 'PASS message_id: unique, ON CONFLICT DO NOTHING, nulls allowed';

  -- Defaults and constraints on the new columns
  select * into r from public.reply_events where message_id = 'm-1@mail';
  assert r.classify_attempts = 0 and not r.needs_manual_review and r.handled_at is null and r.audience is null, 'defaults';
  begin
    update public.reply_events set audience = 'b2x' where message_id = 'm-1@mail';
    raise exception 'bad audience accepted';
  exception when check_violation then null;
  end;
  update public.reply_events set audience = 'b2c', assigned_to = owner_id, profile_id = owner_id,
    extracted = '{"need":"x","roles":[],"locations":[],"timeline":null,"question":null,"sentiment":"neutral"}',
    next_action = 'send shortlist', next_action_due = now() - interval '1 day'
  where message_id = 'm-1@mail';
  raise notice 'PASS new columns: defaults, audience check, owner/profile FKs';

  -- Owner removed: reply keeps going, unassigned
  assert (select count(*) from public.reply_events where next_action is not null and handled_at is null and next_action_due < now()) >= 1, 'overdue query';

  -- growth_settings owner
  update public.growth_settings set default_reply_owner = owner_id where id = 1;
  assert (select default_reply_owner from public.growth_settings where id = 1) = owner_id, 'default owner';
  raise notice 'PASS growth_settings.default_reply_owner';

  -- prospects can be marked replied (existing check allows it)
  insert into public.prospects (kind, email, source, status) values ('job_seeker', 'p@replies.test', 'test', 'contacted');
  update public.prospects set status = 'replied' where email = 'p@replies.test' and status in ('new', 'contacted');
  assert (select status from public.prospects where email = 'p@replies.test') = 'replied', 'prospect replied';
  raise notice 'PASS prospect write-back';
end $$;

-- Deleting the owner's profile unassigns rather than blocking (on delete set null).
delete from auth.users where id = '00000000-0000-4000-8000-0000000005a1';
do $$
begin
  assert (select assigned_to is null and profile_id is null from public.reply_events where message_id = 'm-1@mail'), 'set null on delete';
  assert (select default_reply_owner is null from public.growth_settings where id = 1), 'settings owner set null';
  raise notice 'PASS profile delete sets owner/profile null';
end $$;
