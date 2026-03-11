alter table "public"."job_hopper_live" drop constraint "job_hopper_live_apply_link_key";

drop index if exists "public"."job_hopper_live_apply_link_key";

alter table "public"."job_matches" alter column "job_id" set not null;


