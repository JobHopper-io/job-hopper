/**
 * Row shapes for Supabase queries in Edge Functions (aligns with `src/types/supabase.ts` public tables).
 */

export interface MatchingAlgorithmConfigRow {
  id: string
  name: string
  active: boolean
  created_at: string
  updated_at: string
  keyword_current_job_title_weight: number
  keyword_current_industry_weight: number
  pay_inside_range_weight: number
  pay_near_range_weight: number
  pay_missing_salary_weight: number
  pay_below_range_penalty: number
  loc_same_metro_weight: number
  loc_same_state_weight: number
  loc_remote_preferred_weight: number
  loc_relocation_allowed_weight: number
  loc_other_location_penalty: number
  loc_distance_0_10_weight: number
  loc_distance_10_25_weight: number
  loc_distance_25_50_weight: number
  loc_distance_50_100_weight: number
  loc_distance_beyond_100_weight: number
  loc_within_radius_bonus_weight: number
  recency_base_weight: number
  recency_per_day_decay: number
  recency_max_age_days: number
  threshold_min_total_score: number
  threshold_no_keyword_match_penalty: number
  threshold_over_pay_tolerance_pct: number
  threshold_under_pay_tolerance_pct: number
}

/** Subset of `job_hopper_live` columns loaded by match/test-job-matching functions */
export interface JobHopperLiveJobRow {
  id: string
  job_title: string | null
  company_name: string | null
  role_category: string | null
  location: string | null
  is_remote: boolean | null
  description: string | null
  ai_job_briefing: string | null
  apply_link: string | null
  pay_min: number | null
  pay_max: number | null
  pay_type: string | null
  created_at: string
  posted_date: string | null
  employee_count: number | null
  sponsorship_likelihood: 'Low' | 'Medium' | 'High' | 'N/A' | null
}
