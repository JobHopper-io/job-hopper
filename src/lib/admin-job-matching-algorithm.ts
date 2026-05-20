import { supabase } from '@/lib/supabase'
import type { FunctionsHttpError } from '@supabase/supabase-js'

function messageFromFunctionsHttpError(error: FunctionsHttpError): string {
  const ctx = error.context as { body?: string } | undefined
  const raw = ctx?.body
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw) as { error?: string; detail?: string }
      if (parsed.error) return parsed.error
      if (parsed.detail) return parsed.detail
    } catch {
      return raw.slice(0, 500)
    }
  }
  return error.message
}

export interface PhraseMatchSurfaceDetail {
  primaryPhrases: string[]
  secondaryPhrases: string[]
  industryPhrases: string[]
  matchedBySurface: {
    primary?: Partial<Record<'title' | 'description' | 'briefing', string>>
    secondary?: Partial<Record<'title' | 'description' | 'briefing', string>>
    industry?: Partial<Record<'title' | 'description' | 'briefing', string>>
  }
  surfaceScores: {
    primary: Record<'title' | 'description' | 'briefing', number>
    secondary: Record<'title' | 'description' | 'briefing', number>
    industry: Record<'title' | 'description' | 'briefing', number>
  }
}

export interface RankedJob {
  id: string
  title: string | null
  companyName: string | null
  location: string | null
  description: string | null
  aiBriefing: string | null
  applyLink: string | null
  createdAt: string
  /** When set, used for recency scoring and display; otherwise {@link createdAt} is shown. */
  postedDate?: string | null
  score: number
  components?: {
    role: number
    pay: number
    location: number
    recency: number
  }
  phraseMatch?: PhraseMatchSurfaceDetail
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
    /** Present on current API; may be absent on older deployed functions. */
    averagePayScore?: number | null
    averageLocationScore: number | null
    averageRecencyScore: number | null
    maxPossibleScore: number
  }
  phrases: {
    phrase: string
    kind: 'primary' | 'secondary' | 'industry'
    matchedJobCount: number
  }[]
  matchSurfaces?: {
    title: number
    description: number
    briefing: number
  }
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
  /** When set (including empty string), overrides profile target title for matching. */
  targetJobTitle?: string | null
  currentJobTitle?: string | null
  currentIndustry?: string | null
  payRangeMin?: number | null
  payRangeMax?: number | null
  preferredLocations?: string[]
  openToRelocation?: boolean | null
  openToRemote?: boolean | null
  locationRadiusMiles?: number | null
}

export interface MatchConfigPhraseSurfaceWeights {
  title?: number
  description?: number
  briefing?: number
}

export interface MatchConfigPhraseWeights {
  primary?: MatchConfigPhraseSurfaceWeights
  secondary?: MatchConfigPhraseSurfaceWeights
  industry?: MatchConfigPhraseSurfaceWeights
}

export interface MatchConfigPhraseMatching {
  minPrimaryWords?: number
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
  phraseWeights?: MatchConfigPhraseWeights
  phraseMatching?: MatchConfigPhraseMatching
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

export interface OnboardedMatchingSubscriberRow {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  hasActiveSubscription: boolean
}

export interface SubscriberMatchingPreferencesPayload {
  subscriptionTierProductKeys: string[]
  roles: string[]
  targetJobTitle: string | null
  currentJobTitle: string | null
  currentIndustry: string | null
  payRangeMin: number | null
  payRangeMax: number | null
  preferredLocations: string[]
  openToRelocation: boolean | null
  openToRemote: boolean | null
  locationRadiusMiles: number | null
}

export interface AdminMatchingSubscriberPreferencesResponse {
  profileId: string
  email: string | null
  firstName: string | null
  lastName: string | null
  hasActiveSubscription: boolean
  preferences: SubscriberMatchingPreferencesPayload
}

export interface OnboardedMatchingSubscribersListResult {
  subscribers: OnboardedMatchingSubscriberRow[]
  truncated: boolean
}

export interface GetAdminMatchesOptions {
  /**
   * When set, the test-job-matching function uses this profile as the subscriber under test
   * (must have completed onboarding). Omit or empty to use the logged-in admin’s profile as the base.
   */
  targetProfileId?: string | null
  preferencesOverride?: SubscriberPreferencesOverride
  matchConfigOverride?: MatchConfigOverride
}

/** Default admin match config values (mirror of backend defaultConfig). Used for form defaults and reset. */
export const DEFAULT_ADMIN_MATCH_CONFIG: MatchConfigOverride = {
  phraseWeights: {
    primary: { title: 4, description: 1, briefing: 0 },
    secondary: { title: 1, description: 0.5, briefing: 0 },
    industry: { title: 2, description: 1, briefing: 0 },
  },
  phraseMatching: {
    minPrimaryWords: 2,
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
      targetProfileId?: string
      preferencesOverride?: SubscriberPreferencesOverride
      matchConfigOverride?: MatchConfigOverride
    } = {}
    const targetId = options.targetProfileId?.trim()
    if (targetId) {
      body.targetProfileId = targetId
    }
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

  async listOnboardedMatchingSubscribers(): Promise<{
    data: OnboardedMatchingSubscribersListResult | null
    error: Error | null
  }> {
    const { data, error } = await supabase.functions.invoke<OnboardedMatchingSubscribersListResult>(
      'admin-matching-onboarded-users',
      { method: 'POST', body: {} },
    )

    if (error) {
      return { data: null, error: new Error(error.message) }
    }

    return {
      data: data ?? null,
      error: null,
    }
  },

  async getSubscriberPreferencesForMatching(
    profileId: string,
  ): Promise<{ data: AdminMatchingSubscriberPreferencesResponse | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<AdminMatchingSubscriberPreferencesResponse>(
      'admin-matching-subscriber-preferences',
      { method: 'POST', body: { profileId } },
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

  async archiveConfig(id: string): Promise<{ error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
      'admin-matching-configs',
      {
        method: 'POST',
        body: {
          action: 'archive',
          id,
        },
      },
    )

    if (error) {
      return { error: new Error(messageFromFunctionsHttpError(error as FunctionsHttpError)) }
    }

    if (data?.error) {
      return { error: new Error(data.error) }
    }

    return { error: null }
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

