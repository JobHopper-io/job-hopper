-- Free / Core / Premium product model (feature-depth pricing).
--
-- Replaces the legacy career-level base plans (Entry & Mid, Senior & Management,
-- Director/VP/C-Level -- all identical features) with feature-depth tiers.
--
-- Free is NOT a product row: it is simply "no active subscription" (derived state).
-- Core is the only sellable tier today ($29/mo). Premium is a placeholder row
-- (informational $49 target price) that is NOT purchasable yet -- it is exposed on
-- /pricing as a waitlist capture until the Days 31-60 roadmap ships a real price.
--
-- No enum change is needed: Core and Premium are `base_plan` (product_category
-- already has base_plan | subscription_addon | one_time_addon | one_time_item).
--
-- The 6 in-flight legacy trial subscriptions are intentionally NOT touched. Setting
-- available_for_purchase = false only removes the legacy plans from new-signup
-- selection (getBasePlanProducts / create-checkout-session both filter on it); the
-- rows stay and their existing subscription_product references keep working.

-- ---------------------------------------------------------------------------
-- 1. New feature-depth base plans
-- ---------------------------------------------------------------------------
-- Core: sellable now. stripe_product_id is left NULL; the checkout flow's
-- getStripeProductId() lazily creates the Stripe product on first checkout and
-- persists the id. Prices are built inline via price_data (unit_amount = price_cents,
-- recurring monthly), so no pre-created Stripe Price object is required. If a Stripe
-- product is created up front (see task notes), backfill its id here.
INSERT INTO public.products (key, display_name, description, category, price_cents, available_for_purchase, stripe_product_id)
VALUES
  ('core', 'Core', 'Curated job matches with the core Job Hopper toolkit.', 'base_plan', 2900, true, NULL)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_cents = EXCLUDED.price_cents,
  available_for_purchase = EXCLUDED.available_for_purchase;

-- Premium: informational only until it becomes sellable. available_for_purchase = false
-- keeps it out of every checkout path; price_cents mirrors the $49 target for display.
INSERT INTO public.products (key, display_name, description, category, price_cents, available_for_purchase, stripe_product_id)
VALUES
  ('premium', 'Premium', 'Everything in Core plus premium hiring insights and deeper matching. Coming soon.', 'base_plan', 4900, false, NULL)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_cents = EXCLUDED.price_cents,
  available_for_purchase = EXCLUDED.available_for_purchase;

-- ---------------------------------------------------------------------------
-- 2. Retire legacy career-level base plans for NEW signups (rows kept intact)
-- ---------------------------------------------------------------------------
UPDATE public.products
SET available_for_purchase = false
WHERE key IN ('entry_mid', 'senior_management', 'director_vp_c_level');

-- ---------------------------------------------------------------------------
-- 3. Premium waitlist capture
-- ---------------------------------------------------------------------------
-- Stores interest for Premium before it is sellable. profile_id is nullable so
-- logged-out visitors on /pricing can join too. Inserts happen through the
-- premium-waitlist edge function (service role), so no INSERT policy is granted
-- to anon/authenticated.
create table if not exists public.premium_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists premium_waitlist_email_idx on public.premium_waitlist (lower(email));
create index if not exists premium_waitlist_profile_id_idx on public.premium_waitlist (profile_id);

alter table public.premium_waitlist enable row level security;

-- Admins may review the list; nobody else can read it. Writes go through the
-- service-role edge function, which bypasses RLS.
drop policy if exists "Admins can read premium_waitlist" on public.premium_waitlist;
create policy "Admins can read premium_waitlist"
on public.premium_waitlist
for select
to authenticated
using (
  public.current_user_has_role('admin')
  or public.current_user_has_role('super_admin')
);

grant select on public.premium_waitlist to authenticated;
grant all on public.premium_waitlist to service_role;
