-- Billing is being reduced to the 3 subscription tiers (Free/Core/Premium) plus the Core
-- free-month promo - no one-time purchases for now. resume_upgrade has no other purpose
-- (unlike per_job_resume_advice, which stays available_for_purchase=true because it also
-- backs the tier-gated Resume Advice quota feature), so it's simply disabled here, same
-- pattern as the retired legacy career-level plans - never hard-deleted, so existing
-- resume_products history/FKs for past buyers stay intact.
update public.products
set available_for_purchase = false
where key = 'resume_upgrade';
