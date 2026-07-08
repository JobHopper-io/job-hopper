-- Career level as a first-class profile field, decoupled from the base-plan product key.
--
-- Historically the base-plan products.key (entry_mid / senior_management /
-- director_vp_c_level) doubled as the job-matching career tier (it is matched against
-- job_hopper_live.subscription_tier). The Free/Core/Premium model makes base plans
-- feature-depth, not career level, so a Core subscriber has NO career-level product key
-- and would match zero jobs (an empty tier-key list filters out every job).
--
-- Career level now lives on profiles.career_level and is the single source of truth for
-- matching alignment. It is NEVER derived from which product the user bought.

-- 1. Enum. Values MUST equal the job_hopper_live.subscription_tier values used by matching
--    (see fetch-jobs-for-matching.ts: query.in('subscription_tier', ...tier keys)).
DO $$ BEGIN
  CREATE TYPE public.career_level AS ENUM (
    'entry_mid',
    'senior_management',
    'director_vp_c_level'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Nullable column: existing profiles stay NULL until they set it (see backfill below /
--    onboarding). A NULL career level yields no matches, same as before onboarding completed.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS career_level public.career_level;

-- 3. Backfill from the per-profile signals that already encoded career level.
-- 3a. Freemium users: their explicit selection lives in freemium_usage.selected_tier_key.
UPDATE public.profiles p
SET career_level = fu.selected_tier_key::public.career_level
FROM public.freemium_usage fu
WHERE fu.profile_id = p.id
  AND p.career_level IS NULL
  AND fu.selected_tier_key IN ('entry_mid', 'senior_management', 'director_vp_c_level');

-- 3b. Trial/active subscribers on a legacy career-level plan: the base-plan key WAS the
--     career level under the old model. (Core/Premium keys are intentionally excluded.)
UPDATE public.profiles p
SET career_level = prod.key::public.career_level
FROM public.subscriptions s
JOIN public.subscription_product sp ON sp.subscription_id = s.id
JOIN public.products prod ON prod.id = sp.product_id
WHERE s.profile_id = p.id
  AND p.career_level IS NULL
  AND s.status IN ('trial', 'active')
  AND prod.category = 'base_plan'
  AND prod.key IN ('entry_mid', 'senior_management', 'director_vp_c_level');
