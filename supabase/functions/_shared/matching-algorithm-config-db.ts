import type { MatchConfig } from './job-matching-algorithm.ts'

/** Columns read from `matching_algorithm_config` when mapping into matcher config overrides. */
export interface MatchingAlgorithmConfigDbRow {
  keyword_current_job_title_weight?: number | null
  keyword_current_industry_weight?: number | null
  pay_inside_range_weight?: number | null
  pay_near_range_weight?: number | null
  pay_missing_salary_weight?: number | null
  pay_below_range_penalty?: number | null
  loc_same_metro_weight?: number | null
  loc_same_state_weight?: number | null
  loc_remote_preferred_weight?: number | null
  loc_relocation_allowed_weight?: number | null
  loc_other_location_penalty?: number | null
  loc_distance_0_10_weight?: number | null
  loc_distance_10_25_weight?: number | null
  loc_distance_25_50_weight?: number | null
  loc_distance_50_100_weight?: number | null
  loc_distance_beyond_100_weight?: number | null
  loc_within_radius_bonus_weight?: number | null
  recency_base_weight?: number | null
  recency_per_day_decay?: number | null
  recency_max_age_days?: number | null
  threshold_min_total_score?: number | null
  threshold_no_keyword_match_penalty?: number | null
  threshold_over_pay_tolerance_pct?: number | null
  threshold_under_pay_tolerance_pct?: number | null
  threshold_require_multi_token_title_match?: boolean | null
  excluded_title_keywords?: unknown
  semantic_rerank_enabled?: boolean | null
  semantic_rerank_count?: number | null
  semantic_weight?: number | null
}

export function matchingAlgorithmConfigRowToPartial(row: MatchingAlgorithmConfigDbRow): Partial<MatchConfig> {
  const keywordWeights = {
    currentJobTitleKeyword: row.keyword_current_job_title_weight,
    currentIndustryKeyword: row.keyword_current_industry_weight,
  }

  const payWeights = {
    insideRange: row.pay_inside_range_weight,
    nearRange: row.pay_near_range_weight,
    missingSalary: row.pay_missing_salary_weight,
    belowRangePenalty: row.pay_below_range_penalty,
  }

  const locationWeights = {
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
  }

  const recencyWeights = {
    baseRecency: row.recency_base_weight,
    perDayDecay: row.recency_per_day_decay,
    maxAgeDays: row.recency_max_age_days,
  }

  const thresholds = {
    minTotalScore: row.threshold_min_total_score,
    noKeywordMatchPenalty: row.threshold_no_keyword_match_penalty,
    overPayTolerancePct: row.threshold_over_pay_tolerance_pct,
    underPayTolerancePct: row.threshold_under_pay_tolerance_pct,
    requireMultiTokenTitleMatch:
      typeof row.threshold_require_multi_token_title_match === 'boolean'
        ? row.threshold_require_multi_token_title_match
        : true,
  }

  return {
    keywordWeights: keywordWeights as MatchConfig['keywordWeights'],
    payWeights: payWeights as MatchConfig['payWeights'],
    locationWeights: locationWeights as MatchConfig['locationWeights'],
    recencyWeights: recencyWeights as MatchConfig['recencyWeights'],
    thresholds: thresholds as MatchConfig['thresholds'],
    excludedTitleKeywords: Array.isArray(row.excluded_title_keywords)
      ? row.excluded_title_keywords.filter((s: unknown) => typeof s === 'string')
      : [],
    semantic: {
      rerankEnabled: !!row.semantic_rerank_enabled,
      rerankCount:
        typeof row.semantic_rerank_count === 'number' && Number.isFinite(row.semantic_rerank_count)
          ? row.semantic_rerank_count
          : 30,
      weight:
        typeof row.semantic_weight === 'number' && Number.isFinite(row.semantic_weight)
          ? row.semantic_weight
          : 1.5,
    },
  }
}

export function mergePartialMatchConfigs(
  base: Partial<MatchConfig> | null | undefined,
  override: Partial<MatchConfig> | null | undefined,
): Partial<MatchConfig> | undefined {
  if (!base && !override) return undefined
  if (!base && override) return override
  if (base && !override) return base

  const b = base as Partial<MatchConfig>
  const o = override as Partial<MatchConfig>

  return {
    ...b,
    ...o,
    keywordWeights: {
      ...(b.keywordWeights ?? {}),
      ...(o.keywordWeights ?? {}),
    },
    payWeights: {
      ...(b.payWeights ?? {}),
      ...(o.payWeights ?? {}),
    },
    locationWeights: {
      ...(b.locationWeights ?? {}),
      ...(o.locationWeights ?? {}),
    },
    recencyWeights: {
      ...(b.recencyWeights ?? {}),
      ...(o.recencyWeights ?? {}),
    },
    thresholds: {
      ...(b.thresholds ?? {}),
      ...(o.thresholds ?? {}),
    },
    debug: {
      ...(b.debug ?? {}),
      ...(o.debug ?? {}),
    },
    excludedTitleKeywords: o.excludedTitleKeywords ?? b.excludedTitleKeywords,
    semantic: {
      ...(b.semantic ?? {}),
      ...(o.semantic ?? {}),
    },
  }
}

export interface MatchingAlgorithmAdminDbRow extends MatchingAlgorithmConfigDbRow {
  id: string
  name: string
  active: boolean
  created_at: string
  updated_at: string
}
