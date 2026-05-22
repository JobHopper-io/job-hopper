import type { MatchConfig } from './job-matching-algorithm.ts'
import type { Tables } from './database.ts'

export type MatchingAlgorithmConfigRow = Tables<'matching_algorithm_config'>

export function configRowToOverride(row: MatchingAlgorithmConfigRow): Partial<MatchConfig> {
  return {
    categoryWeights: {
      phrase: row.cat_weight_phrase,
      pay: row.cat_weight_pay,
      location: row.cat_weight_location,
      recency: row.cat_weight_recency,
      filterMatches: row.cat_weight_filter_matches,
    },
    phrase: {
      tierFactors: {
        primary: row.phrase_tier_factor_primary,
        industry: row.phrase_tier_factor_industry,
        secondary: row.phrase_tier_factor_secondary,
      },
      surfaceWeights: {
        title: row.phrase_surface_weight_title,
        description: row.phrase_surface_weight_description,
        briefing: row.phrase_surface_weight_briefing,
      },
    },
    pay: {
      missingSalaryQuality: row.pay_missing_salary_quality,
      nearRangeQuality: row.pay_near_range_quality,
      aboveRangeQuality: row.pay_above_range_quality,
      overToleranceFraction: row.pay_over_tolerance_fraction,
      underToleranceFraction: row.pay_under_tolerance_fraction,
      hardFloorEnabled: row.pay_hard_floor_enabled,
      hardFloorFraction: row.pay_hard_floor_fraction,
    },
    location: {
      bandQualities: {
        d0to10: row.loc_band_d0_10,
        d10to25: row.loc_band_d10_25,
        d25to50: row.loc_band_d25_50,
        d50to100: row.loc_band_d50_100,
        dBeyond100: row.loc_band_beyond_100,
      },
      sameMetroQuality: row.loc_same_metro_quality,
      sameStateQuality: row.loc_same_state_quality,
      remoteAsPerfect: row.loc_remote_as_perfect,
      relocationGateEnabled: row.loc_relocation_gate_enabled,
    },
    recency: {
      maxAgeDays: row.recency_max_age_days,
    },
    thresholds: {
      minTotalScore: row.threshold_min_total_score,
    },
    phraseGate: {
      requirePrimaryOrIndustry: row.phrase_gate_require_primary_or_industry,
    },
  }
}
