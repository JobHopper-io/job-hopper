// Convenience type aliases for common database types
// Import from the generated Supabase types file
import type { Tables, Enums, TablesInsert, TablesUpdate } from './supabase'

// Convenience type aliases for common database types
export type Profile = Tables<'profiles'>

// Operation types for common entities
export type ProfileInsert = TablesInsert<'profiles'>
export type ProfileUpdate = TablesUpdate<'profiles'>

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

// Subscription and product types from DB schema
export type Subscription = Tables<'subscriptions'>
export type SubscriptionStatus = Enums<'subscription_status'>
export type Product = Tables<'products'>
export type ProductType = Enums<'product_type'>
export type SubscriptionProduct = Tables<'subscription_product'>
