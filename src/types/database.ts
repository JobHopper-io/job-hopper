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
  | 'target_job_title'
  | 'years_of_experience'
  | 'current_industry'
  | 'target_role_categories'
  | 'desired_salary_min'
  | 'desired_salary_max'
  | 'preferred_locations'
  | 'open_to_relocation'
  | 'open_to_remote'
  | 'location_radius_miles'
  | 'requires_us_sponsorship'
  | 'excluded_keywords'
>

// Subscription and product types from DB schema
export type Subscription = Tables<'subscriptions'>
export type SubscriptionStatus = Enums<'subscription_status'>
export type Product = Tables<'products'>
export type ProductCategory = Enums<'product_category'>
export type SubscriptionProduct = Tables<'subscription_product'>

// Roles and profile_roles (application-level roles such as admin)
export type Role = Tables<'roles'>
export type ProfileRole = Tables<'profile_roles'>
export type ProfileRoleInsert = TablesInsert<'profile_roles'>

// Scheduled jobs (run by run-scheduled-jobs edge function; only service_role accesses this table)
export type ScheduledJob = Tables<'scheduled_jobs'>
export type ScheduledJobStatus = Enums<'scheduled_job_status'>
export type ScheduledJobInsert = TablesInsert<'scheduled_jobs'>
export type ScheduledJobUpdate = TablesUpdate<'scheduled_jobs'>

// Job matching and favorites
export type JobMatch = Tables<'job_matches'>
export type SavedJob = Tables<'saved_jobs'>
export type JobHopperLive = Tables<'job_hopper_live'>
export type PayType = Enums<'pay_type'>
export type RoleCategory = Enums<'role_category'>
export type SponsorshipLikelihood = Enums<'sponsorship_likelihood'>

/** Hiring contact (e.g. for Premium Insights); optional on MatchedJob when data is available */
export interface JobContact {
  name: string
  title: string | null
  location: string | null
  note: string | null
}

/** Job match with joined job details for feed and job detail views */
export interface MatchedJob {
  matchId: string
  jobId: string
  score: number | null
  createdAt: string
  isSaved: boolean
  title: string | null
  company: string | null
  location: string | null
  description: string | null
  aiBriefing: string | null
  applyLink: string | null
  roleCategory: RoleCategory | null
  subscriptionTier: string | null
  /** Human-readable tier label from products.display_name (e.g. plan level) */
  subscriptionTierDisplayName: string | null
  schedules: string[] | null
  employmentTypes: string[] | null
  payMin: number | null
  payMax: number | null
  payType: PayType | null
  employeeCount: number | null
  postedDate: string | null
  isRemote: boolean | null
  sponsorshipLikelihood: SponsorshipLikelihood | null
  /** Present when the user saved this match */
  savedAt?: string | null
  /** When set, match is archived from the default dashboard feed */
  archivedAt?: string | null
  contacts?: JobContact[]
}

/** Aggregate stats for the current user's job matches */
export interface MatchingStats {
  thisWeek: number
  totalDelivered: number
  avgMatchScore: number | null
}

// Resume products (upgrade and per-job resume advice; per-job product key is per_job_resume_advice).
// improvements_text holds n8n LLM output for fulfilled rows (upgrade and per-job).
export type ResumeProduct = Tables<'resume_products'>
export type ResumeProductStatus = Enums<'resume_product_status'>
export type ResumeProductInsert = TablesInsert<'resume_products'>
export type ResumeProductUpdate = TablesUpdate<'resume_products'>

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

// Dashboard banner (singleton row id = 1); admins configure message and schedule
export type DashboardBanner = Tables<'dashboard_banner'>
export type DashboardBannerUpdate = TablesUpdate<'dashboard_banner'>

// Job matching algorithm configuration
export type MatchingAlgorithmConfig = Tables<'matching_algorithm_config'>
export type MatchingAlgorithmConfigInsert = TablesInsert<'matching_algorithm_config'>
export type MatchingAlgorithmConfigUpdate = TablesUpdate<'matching_algorithm_config'>

export type JobHiringContact = Tables<'job_hiring_contacts'>
export type HiringContactLookupStatus = Enums<'hiring_contact_lookup_status'>
