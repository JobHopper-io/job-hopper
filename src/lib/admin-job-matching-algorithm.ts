import { supabase } from '@/lib/supabase'

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
  locationParsed?: boolean
  /** Effective sponsorship likelihood: stored value if not N/A, else inferred from job data */
  effectiveSponsorshipLikelihood?: 'Low' | 'Medium' | 'High'
}

export interface MatchJobsDebugPayload {
  filters: {
    totalJobs: number
    excludedBySubscriptionTier: number
    excludedByRole: number
    excludedByRemoteOptOut: number
    excludedByLocation: number
    excludedByRecency: number
    excludedByNoKeywordMatch: number
    excludedByMinTotalScore: number
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
  subscriptionTierProductKeys?: string[]
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
  distance0to10?: number
  distance10to25?: number
  distance25to50?: number
  distance50to100?: number
  distanceBeyond100?: number
  withinRadiusBonus?: number
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

export interface AdminMatchingConfig {
  id: string
  name: string
  active: boolean
  createdAt: string
  updatedAt: string
  config: MatchConfigOverride
}

export interface GetAdminMatchesOptions {
  preferencesOverride?: SubscriberPreferencesOverride
  matchConfigOverride?: MatchConfigOverride
}

/** Default admin match config values (mirror of backend defaultConfig). Used for form defaults and reset. */
export const DEFAULT_ADMIN_MATCH_CONFIG: MatchConfigOverride = {
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
    distance0to10: 4,
    distance10to25: 3,
    distance25to50: 2,
    distance50to100: 1,
    distanceBeyond100: 0,
    withinRadiusBonus: 3,
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

export const jobMatchingAlgorithmAdminAPI = {
  async getAdminMatches(options: GetAdminMatchesOptions = {}): Promise<{
    data: MatchJobsResponse | null
    error: Error | null
  }> {
    const body: {
      preferencesOverride?: SubscriberPreferencesOverride
      matchConfigOverride?: MatchConfigOverride
    } = {}
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

  async listConfigs(): Promise<{ data: AdminMatchingConfig[]; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{
      configs: {
        id: string
        name: string
        active: boolean
        created_at: string
        updated_at: string
        config: MatchConfigOverride
      }[]
    }>('admin-matching-configs', {
      method: 'POST',
      body: { action: 'list' },
    })

    if (error) {
      return { data: [], error: new Error(error.message) }
    }

    const rows = data?.configs ?? []
    const mapped: AdminMatchingConfig[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      config: row.config ?? {},
    }))

    return { data: mapped, error: null }
  },

  async createConfigFromOverride(
    name: string,
    values: MatchConfigOverride,
    makeActive: boolean,
  ): Promise<{ data: AdminMatchingConfig | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{
      config: {
        id: string
        name: string
        active: boolean
        created_at: string
        updated_at: string
        config: MatchConfigOverride
      }
    }>('admin-matching-configs', {
      method: 'POST',
      body: {
        action: 'create',
        name,
        makeActive,
        config: values,
      },
    })

    if (error || !data?.config) {
      return { data: null, error: error ? new Error(error.message) : new Error('No config returned') }
    }

    const row = data.config
    return {
      data: {
        id: row.id,
        name: row.name,
        active: row.active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        config: row.config ?? {},
      },
      error: null,
    }
  },

  async updateConfigFromOverride(
    id: string,
    name: string | undefined,
    values: MatchConfigOverride,
    makeActive: boolean | undefined,
  ): Promise<{ data: AdminMatchingConfig | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{
      config: {
        id: string
        name: string
        active: boolean
        created_at: string
        updated_at: string
        config: MatchConfigOverride
      }
    }>('admin-matching-configs', {
      method: 'POST',
      body: {
        action: 'update',
        id,
        name,
        makeActive,
        config: values,
      },
    })

    if (error || !data?.config) {
      return { data: null, error: error ? new Error(error.message) : new Error('No config returned') }
    }

    const row = data.config
    return {
      data: {
        id: row.id,
        name: row.name,
        active: row.active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        config: row.config ?? {},
      },
      error: null,
    }
  },

  async activateConfig(id: string): Promise<{ data: AdminMatchingConfig | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{
      config: {
        id: string
        name: string
        active: boolean
        created_at: string
        updated_at: string
        config: MatchConfigOverride
      }
    }>('admin-matching-configs', {
      method: 'POST',
      body: {
        action: 'activate',
        id,
      },
    })

    if (error || !data?.config) {
      return { data: null, error: error ? new Error(error.message) : new Error('No config returned') }
    }

    const row = data.config
    return {
      data: {
        id: row.id,
        name: row.name,
        active: row.active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        config: row.config ?? {},
      },
      error: null,
    }
  },
}

