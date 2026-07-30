-- The post-signup feature-tour walkthrough is for new signups only, not existing users who
-- already know the product. Backfill has_seen_walkthrough=true for everyone who had already
-- finished onboarding as of this migration, so only future signups see it.
update public.profiles
set has_seen_walkthrough = true
where onboarding_completed = true;
