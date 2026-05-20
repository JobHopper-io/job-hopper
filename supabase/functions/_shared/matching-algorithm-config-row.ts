import type { MatchConfig } from './job-matching-algorithm.ts'

/** Mirrors `public.matching_algorithm_config` Row (keep in sync with regenerated `src/types/supabase.ts`). */
export interface MatchingAlgorithmConfigRow {
  id: string
  name: string
  active: boolean
  archived: boolean
  created_at: string
  updated_at: string
  phrase_primary_title_weight: number
  phrase_primary_description_weight: number
  phrase_primary_briefing_weight: number
  phrase_secondary_title_weight: number
  phrase_secondary_description_weight: number
  phrase_secondary_briefing_weight: number
  phrase_industry_title_weight: number
  phrase_industry_description_weight: number
  phrase_industry_briefing_weight: number
  phrase_min_primary_words: number
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

export function configRowToOverride(row: MatchingAlgorithmConfigRow): Partial<MatchConfig> {
  return {
    phraseWeights: {
      primary: {
        title: row.phrase_primary_title_weight,
        description: row.phrase_primary_description_weight,
        briefing: row.phrase_primary_briefing_weight,
      },
      secondary: {
        title: row.phrase_secondary_title_weight,
        description: row.phrase_secondary_description_weight,
        briefing: row.phrase_secondary_briefing_weight,
      },
      industry: {
        title: row.phrase_industry_title_weight,
        description: row.phrase_industry_description_weight,
        briefing: row.phrase_industry_briefing_weight,
      },
    },
    phraseMatching: {
      minPrimaryWords: row.phrase_min_primary_words,
    },
    payWeights: {
      insideRange: row.pay_inside_range_weight,
      nearRange: row.pay_near_range_weight,
      missingSalary: row.pay_missing_salary_weight,
      belowRangePenalty: row.pay_below_range_penalty,
    },
    locationWeights: {
      sameMetro: row.loc_same_metro_weight,
      sameState: row.loc_same_state_weight,
      remotePreferred: row.loc_remote_preferred_weight,
      relocationAllowed: row.loc_relocation_allowed_weight,
      otherLocationPenalty: row.loc_other_location_penalty,
      distance0to10: row.loc_distance_0_10_weight,
      distance10to25: row.loc_distance_10_25_weight,
      distance25to50: row.loc_distance_25_50_weight,
      distance50to100: row.loc_distance_50_100_weight,
      distanceBeyond100: row.loc_distance_beyond_100_weight,
      withinRadiusBonus: row.loc_within_radius_bonus_weight,
    },
    recencyWeights: {
      baseRecency: row.recency_base_weight,
      perDayDecay: row.recency_per_day_decay,
      maxAgeDays: row.recency_max_age_days,
    },
    thresholds: {
      minTotalScore: row.threshold_min_total_score,
      noKeywordMatchPenalty: row.threshold_no_keyword_match_penalty,
      overPayTolerancePct: row.threshold_over_pay_tolerance_pct,
      underPayTolerancePct: row.threshold_under_pay_tolerance_pct,
    },
  }
}
