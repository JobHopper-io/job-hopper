-- Fix product-category drift so a fresh DB matches production.
--
-- On prod these products are add-ons, but the repo migrations left them as `base_plan`,
-- so a local `db reset` renders them as purchasable tiers on the onboarding plan step
-- (e.g. "Resume Upgrade" showing as a $19.95/month plan card). Correct the categories.
-- On prod this is a no-op (they already hold these categories); locally it aligns state.

update public.products set category = 'one_time_addon'
where key = 'resume_upgrade' and category <> 'one_time_addon';

update public.products set category = 'subscription_addon'
where key in ('interview_prep', 'premium_insights') and category <> 'subscription_addon';
