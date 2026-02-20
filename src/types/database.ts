// Convenience type aliases for common database types
// Import from the generated Supabase types file
import type { Tables, Enums, TablesInsert, TablesUpdate } from './supabase'

// Convenience type aliases for common database types
export type Profile = Tables<"profiles">

// Operation types for common entities
export type ProfileInsert = TablesInsert<"profiles">
export type ProfileUpdate = TablesUpdate<"profiles">

// Subset of profile fields that the current user is allowed to edit (self-service). Use this for
// updateProfile and forms; use ProfileUpdate only where the full table update shape is needed.
export type ProfileUserEditable = Pick<
  ProfileUpdate,
  | 'first_name'
  | 'last_name'
  | 'current_job_title'
  | 'years_of_experience'
  | 'current_industry'
  | 'target_role_categories'
  | 'desired_salary_min'
  | 'desired_salary_max'
  | 'preferred_locations'
  | 'open_to_relocation'
  | 'open_to_remote'
>

// Re-export commonly used enums with clearer names
export type BdLeadsStatus = Enums<"bd_leads_status">

// New subscription schema (subscription, products, subscription_product, profile_product)
// Use these until supabase.ts is regenerated; then can switch to Tables<"subscription"> etc.
export type BillingSubscriptionStatus = 'trial' | 'active' | 'canceled'

export interface SubscriptionRow {
  id: string
  stripe_subscription_id: string
  profile_id: string
  subscription_status: BillingSubscriptionStatus
  current_period_ends_at: string | null
}

export interface Product {
  id: string
  stripe_product_id: string
  key: string
  display_name: string
  is_addon: boolean
}

/** Composite returned by getCurrentSubscription(); tier and addons derived from all active subscriptions + profile_product. */
export interface CurrentSubscription {
  /** All active subscriptions (trial or active) for the profile. */
  subscriptions: SubscriptionRow[]
  /** Primary subscription for display (first of subscriptions); null if none. */
  subscription: SubscriptionRow | null
  products: Product[]
  tier: string | null
  addons: Addon[]
  trialEndsAt: string | null
}

// Tier slug for UI (base plan product key)
export type SubscriptionTier = 'entry_mid' | 'senior_management' | 'director_vp_c_level'

// Status for display (new schema uses billing_subscription_status)
export type SubscriptionStatus = BillingSubscriptionStatus

// Globally-used custom types (not in database)
export type AddonType = 'premium_insights' | 'interview_prep' | 'resume_upgrade'

export interface Addon {
  key: AddonType | string
  label: string
}
