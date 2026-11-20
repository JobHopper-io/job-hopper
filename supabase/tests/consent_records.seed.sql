-- Profiles on each side of the backfill cutoffs (2026-03-05 and 2026-07-29, UTC). Run
-- before the migration, inside the rolled-back test transaction. handle_new_user creates
-- each profile; created_at is then set to the boundary under test.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000f1', 'before.march@example.com', '{"first_name":"A"}'),
  ('00000000-0000-4000-8000-0000000000f2', 'march.first@example.com', '{"first_name":"B"}'),
  ('00000000-0000-4000-8000-0000000000f3', 'july.last@example.com', '{"first_name":"C"}'),
  ('00000000-0000-4000-8000-0000000000f4', 'july.new@example.com', '{"first_name":"D"}'),
  ('00000000-0000-4000-8000-0000000000f5', 'no.created@example.com', '{"first_name":"E"}');
update public.profiles set created_at = '2026-03-04 23:59:59+00' where auth_user_id = '00000000-0000-4000-8000-0000000000f1';
update public.profiles set created_at = '2026-03-05 00:00:00+00' where auth_user_id = '00000000-0000-4000-8000-0000000000f2';
update public.profiles set created_at = '2026-07-28 23:59:59+00' where auth_user_id = '00000000-0000-4000-8000-0000000000f3';
update public.profiles set created_at = '2026-07-29 00:00:00+00' where auth_user_id = '00000000-0000-4000-8000-0000000000f4';
update public.profiles set created_at = null where auth_user_id = '00000000-0000-4000-8000-0000000000f5';
-- a billing contact with no auth user, created in the newest band
insert into public.profiles (id, first_name, last_name, email, created_at)
values ('00000000-0000-4000-8000-0000000000f6', 'Bill', 'Contact', 'billing@partner.edu', '2026-10-01 00:00:00+00');
