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
export type ProductCategory = Enums<'product_category'>
export type SubscriptionProduct = Tables<'subscription_product'>

// Scheduled jobs (run by run-scheduled-jobs edge function; only service_role accesses this table)
export type ScheduledJob = Tables<'scheduled_jobs'>
export type ScheduledJobStatus = Enums<'scheduled_job_status'>
export type ScheduledJobInsert = TablesInsert<'scheduled_jobs'>
export type ScheduledJobUpdate = TablesUpdate<'scheduled_jobs'>

// Job matching and favorites
export type JobMatch = Tables<'job_matches'>
export type SavedJob = Tables<'saved_jobs'>

// Notification and email
export type NotificationSettings = Tables<'notification_settings'>
export type NotificationSettingsInsert = TablesInsert<'notification_settings'>
export type NotificationSettingsUpdate = TablesUpdate<'notification_settings'>
export type JobMatchEmailFrequency = Enums<'job_match_email_frequency'>
export type EmailEvent = Tables<'email_events'>
export type EmailEventInsert = TablesInsert<'email_events'>
export type EmailEventType = Enums<'email_event_type'>
export type EmailEventStatus = Enums<'email_event_status'>
export type SystemAnnouncement = Tables<'system_announcements'>
export type SystemAnnouncementInsert = TablesInsert<'system_announcements'>
