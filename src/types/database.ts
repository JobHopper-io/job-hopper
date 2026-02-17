// Convenience type aliases for common database types
// Import from the generated Supabase types file
import type { Tables, Enums, TablesInsert, TablesUpdate } from './supabase'

// Convenience type aliases for common database types
export type Profile = Tables<"profiles">
/** Subscription/billing row (table name "organizations" is legacy; may be renamed to subscriptions in a follow-up). */
export type Organization = Tables<"organizations">
export type Client = Tables<"clients">

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
export type UserRole = Enums<"user_role">
export type SubscriptionTier = Enums<"subscription_tier">
export type SubscriptionStatus = Enums<"subscription_status">
export type ClientStatus = Enums<"client_status">
export type BdLeadsStatus = Enums<"bd_leads_status">

// Globally-used custom types (not in database)
export type AddonType = 'premium_insights' | 'interview_prep' | 'resume_upgrade'

export interface Addon {
  key: AddonType
  label: string
}
