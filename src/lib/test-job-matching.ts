import { supabase } from '@/lib/supabase'

// __TEST_ONLY_START__ — Entire file is for test-job-matching debug view only. Remove this file, MatchJobsDebug.vue, and the debug route before production.

export interface RankedJob {
  id: string
  title: string | null
  companyName: string | null
  location: string | null
  description: string | null
  aiBriefing: string | null
  applyLink: string | null
  createdAt: string
  score: number
  components?: {
    role: number
    pay: number
    location: number
    recency: number
  }
  matchedRoleKeywords?: string[]
  locationDistanceMiles?: number | null
  withinRadius?: boolean
}

export interface MatchJobsDebugPayload {
  filters: {
    totalJobs: number
    excludedByRole: number
    excludedByRemoteOptOut: number
    excludedByLocation: number
    includedAfterFilters: number
  }
  scores: {
    minScore: number | null
    maxScore: number | null
    averageScore: number | null
    averageRoleScore: number | null
    averageLocationScore: number | null
    averageRecencyScore: number | null
    maxPossibleScore: number
  }
  keywords: {
    keyword: string
    matchedJobCount: number
  }[]
}

export interface MatchJobsResponse {
  profile_id: string
  total: number
  jobs: RankedJob[]
  debug?: MatchJobsDebugPayload
}

export interface SubscriberPreferencesOverride {
  roles?: string[]
  currentJobTitle?: string | null
  currentIndustry?: string | null
  payRangeMin?: number | null
  payRangeMax?: number | null
  preferredLocations?: string[]
  openToRelocation?: boolean | null
  openToRemote?: boolean | null
   locationRadiusMiles?: number | null
}

export interface MatchConfigKeywordWeights {
  currentJobTitleKeyword?: number
  currentIndustryKeyword?: number
}

export interface MatchConfigPayWeights {
  insideRange?: number
  nearRange?: number
  missingSalary?: number
  belowRangePenalty?: number
}

export interface MatchConfigLocationWeights {
  sameMetro?: number
  sameState?: number
  remotePreferred?: number
  relocationAllowed?: number
  otherLocationPenalty?: number
}

export interface MatchConfigRecencyWeights {
  baseRecency?: number
  perDayDecay?: number
  maxAgeDays?: number
}

export interface MatchConfigThresholds {
  minTotalScore?: number
  noKeywordMatchPenalty?: number
  overPayTolerancePct?: number
  underPayTolerancePct?: number
}

export interface MatchConfigOverride {
  keywordWeights?: MatchConfigKeywordWeights
  payWeights?: MatchConfigPayWeights
  locationWeights?: MatchConfigLocationWeights
  recencyWeights?: MatchConfigRecencyWeights
  thresholds?: MatchConfigThresholds
}

export interface GetTestMatchesOptions {
  preferencesOverride?: SubscriberPreferencesOverride
  matchConfigOverride?: MatchConfigOverride
}

/** Default match config values (mirror of backend defaultConfig). Used for form defaults and reset. */
export const DEFAULT_TEST_MATCH_CONFIG: MatchConfigOverride = {
  keywordWeights: {
    currentJobTitleKeyword: 2,
    currentIndustryKeyword: 1,
  },
  payWeights: {
    insideRange: 4,
    nearRange: 2,
    missingSalary: 1,
    belowRangePenalty: -2,
  },
  locationWeights: {
    sameMetro: 4,
    sameState: 2,
    remotePreferred: 3,
    relocationAllowed: 1,
    otherLocationPenalty: -3,
  },
  recencyWeights: {
    baseRecency: 3,
    perDayDecay: 0.1,
    maxAgeDays: 45,
  },
  thresholds: {
    minTotalScore: 5,
    noKeywordMatchPenalty: -100,
    overPayTolerancePct: 0.25,
    underPayTolerancePct: 0.15,
  },
}

export const jobMatchingTestAPI = {
  // TEMPORARY TEST METHOD – DO NOT SHIP TO PRODUCTION
  async getTestMatches(options: GetTestMatchesOptions = {}): Promise<{
    data: MatchJobsResponse | null
    error: Error | null
  }> {
    const body: { preferencesOverride?: SubscriberPreferencesOverride; matchConfigOverride?: MatchConfigOverride } =
      {}
    if (options.preferencesOverride && Object.keys(options.preferencesOverride).length > 0) {
      body.preferencesOverride = options.preferencesOverride
    }
    if (options.matchConfigOverride && Object.keys(options.matchConfigOverride).length > 0) {
      body.matchConfigOverride = options.matchConfigOverride
    }

    const { data, error } = await supabase.functions.invoke<MatchJobsResponse>(
      'test-job-matching',
      { method: 'POST', body },
    )

    if (error) {
      return { data: null, error: new Error(error.message) }
    }

    return { data: data ?? null, error: null }
  },
}

// __TEST_ONLY_END__

