// Convenience type aliases for common database types
// Import from the generated Supabase types file
import type { Tables, Enums, TablesInsert, TablesUpdate } from './supabase'

// Convenience type aliases for common database types
export type User = Tables<"users">
export type Organization = Tables<"organizations">
export type Client = Tables<"clients">

// Operation types for common entities
export type UserInsert = TablesInsert<"users">
export type UserUpdate = TablesUpdate<"users">

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
