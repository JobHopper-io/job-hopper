/**
 * Does this Stripe customer belong to this profile? Defense in depth for anything that acts
 * on profiles.stripe_customer_id (e.g. opening the billing portal): if that column were ever
 * changed to someone else's customer id, this refuses instead of handing over their billing.
 *
 * Metadata set when we create customers, by era:
 *   2025-12-19 .. 2026-02-23  create-checkout-session: { supabase_user_id, subscription_id }
 *   2026-02-23 ..             create-checkout-session: { supabase_user_id, supabase_profile_id }
 *   2026-08-24 ..             admin-org-accounts (license billing): { supabase_profile_id, org_account }
 * Rule: if supabase_profile_id is present it must equal the profile id; else if
 * supabase_user_id is present it must equal the auth user id; only when neither is present
 * (a customer created outside this code) fall back to an exact email match. A present but
 * mismatched id never falls back to email.
 */

export interface StripeCustomerLike {
  deleted?: boolean | void // Stripe types Customer.deleted as void, DeletedCustomer.deleted as true
  email?: string | null
  metadata?: Record<string, string> | null
}

export interface ProfileOwner {
  id: string
  auth_user_id: string | null
  email: string | null
}

export type OwnershipResult =
  | { ok: true; via: "profile_id" | "user_id" | "email" }
  | { ok: false; reason: string }

function normalize(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase()
}

export function checkCustomerOwnership(customer: StripeCustomerLike, profile: ProfileOwner): OwnershipResult {
  if (customer.deleted) return { ok: false, reason: "customer is deleted" }
  const meta = customer.metadata ?? {}

  if (meta.supabase_profile_id) {
    return meta.supabase_profile_id === profile.id
      ? { ok: true, via: "profile_id" }
      : { ok: false, reason: "supabase_profile_id does not match" }
  }
  if (meta.supabase_user_id) {
    return profile.auth_user_id && meta.supabase_user_id === profile.auth_user_id
      ? { ok: true, via: "user_id" }
      : { ok: false, reason: "supabase_user_id does not match" }
  }
  const customerEmail = normalize(customer.email)
  if (customerEmail && customerEmail === normalize(profile.email)) return { ok: true, via: "email" }
  return { ok: false, reason: "no ownership metadata and email does not match" }
}
