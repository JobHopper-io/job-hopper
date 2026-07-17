// Convenience type aliases for common database types (keys match generated `Database['public']['Tables']`).
// Import from the generated Supabase types file (`supabase.ts`).
import type { Tables, Enums, TablesInsert, TablesUpdate } from './supabase'

export type JobHiringContactsStatus = Enums<'job_hiring_contacts_status'>
export type ApolloLimitsRow = Tables<'apollo_limits'>

export type Profile = Tables<'profiles'>
/** Career level: single source of truth for job-matching tier (decoupled from plan/product). */
export type CareerLevel = Enums<'career_level'>

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
  | 'career_level'
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

// Real Sponsorship Score (Premium, §3 decision 11): employers is the brand-level identity table,
// employer_sponsorship_scores holds the LCA-only v1 score. `score`/`confidence` are DB `text` +
// check constraint (Low/Medium/High), not a Postgres enum, so RealSponsorshipTier narrows them
// for app code the same way the check constraint narrows them in the DB.
export type Employer = Tables<'employers'>
export type EmployerSponsorshipScore = Tables<'employer_sponsorship_scores'>
export type RealSponsorshipTier = 'Low' | 'Medium' | 'High'

/** Hiring contact (e.g. for Premium Insights); optional on MatchedJob when data is available */
export interface JobContact {
  name: string
  title: string | null
  location: string | null
  note: string | null
  /** Work email when Apollo match returns it (Premium Insights). */
  email: string | null
}

/** Apollo org options when Premium Insights needs the user to pick the employer (ambiguity band, see apollo-limits). */
export interface PremiumInsightsOrgChoice {
  apollo_organization_id: string
  name: string
  primary_domain: string | null
  score: number
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
  /** Real Sponsorship Score fields (§3 decision 11) - populated only when the job's resolved
   * employer has a live employer_sponsorship_scores row (domain-matched, not excluded_from_scoring).
   * Null for everyone else, including free/core users regardless of match - the Premium-only gate
   * on whether to USE these instead of sponsorshipLikelihood lives in the UI layer, not here. */
  sponsorshipRealScore: RealSponsorshipTier | null
  sponsorshipRealConfidence: RealSponsorshipTier | null
  sponsorshipRealRationale: string | null
  contacts?: JobContact[]
  /** Premium Insights pipeline row status for this match, if any */
  premiumInsightsStatus?: JobHiringContactsStatus | null
  premiumInsightsErrorCode?: string | null
  /** When Premium Insights needs the user to pick among tied Apollo organizations */
  premiumInsightsOrgChoices?: PremiumInsightsOrgChoice[] | null
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

// Freemium per-profile usage (counters + selected tier) and global caps (singleton id = 1)
export type FreemiumUsage = Tables<'freemium_usage'>
export type FreemiumUsageInsert = TablesInsert<'freemium_usage'>
export type FreemiumUsageUpdate = TablesUpdate<'freemium_usage'>
export type FreemiumSettings = Tables<'freemium_settings'>
export type FreemiumSettingsUpdate = TablesUpdate<'freemium_settings'>

// Job matching algorithm configuration
export type MatchingAlgorithmConfig = Tables<'matching_algorithm_config'>
export type MatchingAlgorithmConfigInsert = TablesInsert<'matching_algorithm_config'>
export type MatchingAlgorithmConfigUpdate = TablesUpdate<'matching_algorithm_config'>

// Phrase synonym expansion for job matching (admin-editable)
export type MatchSynonym = Tables<'match_synonyms'>
export type MatchSynonymInsert = TablesInsert<'match_synonyms'>
export type MatchSynonymUpdate = TablesUpdate<'match_synonyms'>

// Apollo org resolution (service_role; premium-insights). Not exposed to the client via RLS.
export type CompanyApolloCache = Tables<'company_apollo_cache'>
export type CompanyApolloCacheInsert = TablesInsert<'company_apollo_cache'>
export type CompanyApolloCacheUpdate = TablesUpdate<'company_apollo_cache'>

/** Negative cache for recent org/contact resolution failures (same cache_key as company_apollo_cache). */
export type CompanyApolloSearchMiss = Tables<'company_apollo_search_miss'>
export type CompanyApolloSearchMissInsert = TablesInsert<'company_apollo_search_miss'>
export type CompanyApolloSearchMissUpdate = TablesUpdate<'company_apollo_search_miss'>

// Application tracking (Core+ feature: inline status tagging for job cards).
export type ApplicationStatus = Enums<'application_status'>
export type JobApplication = Tables<'job_applications'>
export type JobApplicationInsert = TablesInsert<'job_applications'>
export type JobApplicationUpdate = TablesUpdate<'job_applications'>
