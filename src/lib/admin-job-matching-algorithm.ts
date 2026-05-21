import { supabase } from '@/lib/supabase'
import {
  errorMessageFromInvokeData,
  parseFunctionsInvokeError,
} from '@/lib/parse-functions-invoke-error'

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
  postedDate?: string | null
  /** Total match score on 0–100 scale. */
  score: number
  /** Category quality scores in [0, 1]. */
  components?: {
    phrase: number
    pay: number
    location: number
    recency: number
  }
  /** Points contributed per category on 0–100 scale. */
  scoreContributions?: {
    phrase: number
    pay: number
    location: number
    recency: number
  }
  phraseMatch?: PhraseMatchSurfaceDetail
  locationDistanceMiles?: number | null
  withinRadius?: boolean
  locationParsed?: boolean
  effectiveSponsorshipLikelihood?: 'Low' | 'Medium' | 'High'
}

export interface MatchJobsDebugPayload {
  filters: {
    totalJobs: number
    excludedBySubscriptionTier: number
    excludedByRole: number
    excludedByRemoteOptOut: number
    excludedByRecency: number
    excludedByPhraseGate: number
    excludedByPayHardFloor: number
    excludedByRelocationGate: number
    excludedByMinTotalScore: number
    includedAfterFilters: number
  }
  scores: {
    minScore: number | null
    maxScore: number | null
    averageScore: number | null
    averagePhraseQuality: number | null
    averagePayQuality: number | null
    averageLocationQuality: number | null
    averageRecencyQuality: number | null
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

export interface MatchConfigCategoryWeights {
  phrase?: number
  pay?: number
  location?: number
  recency?: number
}

export interface MatchConfigPhrase {
  tierFactors?: { primary?: number; industry?: number; secondary?: number }
  surfaceWeights?: { title?: number; description?: number; briefing?: number }
  minPrimaryWords?: number
}

export interface MatchConfigPay {
  missingSalaryQuality?: number
  nearRangeQuality?: number
  aboveRangeQuality?: number
  overToleranceFraction?: number
  underToleranceFraction?: number
  hardFloorEnabled?: boolean
  hardFloorFraction?: number
}

export interface MatchConfigLocationBandQualities {
  d0to10?: number
  d10to25?: number
  d25to50?: number
  d50to100?: number
  dBeyond100?: number
}

export interface MatchConfigLocation {
  bandQualities?: MatchConfigLocationBandQualities
  sameMetroQuality?: number
  sameStateQuality?: number
  remoteAsPerfect?: boolean
  relocationGateEnabled?: boolean
}

export interface MatchConfigRecency {
  maxAgeDays?: number
}

export interface MatchConfigThresholds {
  minTotalScore?: number
}

export interface MatchConfigPhraseGate {
  requirePrimaryOrIndustry?: boolean
}

export interface MatchConfigOverride {
  categoryWeights?: MatchConfigCategoryWeights
  phrase?: MatchConfigPhrase
  pay?: MatchConfigPay
  location?: MatchConfigLocation
  recency?: MatchConfigRecency
  thresholds?: MatchConfigThresholds
  phraseGate?: MatchConfigPhraseGate
}

/** Fully populated nested config used by the admin tuning form (no optional sections). */
export interface AdminMatchConfigForm {
  categoryWeights: {
    phrase: number
    pay: number
    location: number
    recency: number
  }
  phrase: {
    tierFactors: { primary: number; industry: number; secondary: number }
    surfaceWeights: { title: number; description: number; briefing: number }
    minPrimaryWords: number
  }
  pay: {
    missingSalaryQuality: number
    nearRangeQuality: number
    aboveRangeQuality: number
    overToleranceFraction: number
    underToleranceFraction: number
    hardFloorEnabled: boolean
    hardFloorFraction: number
  }
  location: {
    bandQualities: {
      d0to10: number
      d10to25: number
      d25to50: number
      d50to100: number
      dBeyond100: number
    }
    sameMetroQuality: number
    sameStateQuality: number
    remoteAsPerfect: boolean
    relocationGateEnabled: boolean
  }
  recency: {
    maxAgeDays: number
  }
  thresholds: {
    minTotalScore: number
  }
  phraseGate: {
    requirePrimaryOrIndustry: boolean
  }
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
  targetProfileId?: string | null
  preferencesOverride?: SubscriberPreferencesOverride
  matchConfigOverride?: MatchConfigOverride
}

/** Default admin match config (mirrors backend defaultConfig). */
export const DEFAULT_ADMIN_MATCH_CONFIG = {
  categoryWeights: {
    phrase: 0.5,
    pay: 0.15,
    location: 0.25,
    recency: 0.1,
  },
  phrase: {
    tierFactors: { primary: 1, industry: 0.7, secondary: 0.4 },
    surfaceWeights: { title: 0.6, description: 0.3, briefing: 0.1 },
    minPrimaryWords: 2,
  },
  pay: {
    missingSalaryQuality: 0.3,
    nearRangeQuality: 0.5,
    aboveRangeQuality: 0.7,
    overToleranceFraction: 0.25,
    underToleranceFraction: 0.15,
    hardFloorEnabled: false,
    hardFloorFraction: 0.3,
  },
  location: {
    bandQualities: {
      d0to10: 1,
      d10to25: 0.85,
      d25to50: 0.65,
      d50to100: 0.35,
      dBeyond100: 0,
    },
    sameMetroQuality: 0.7,
    sameStateQuality: 0.4,
    remoteAsPerfect: true,
    relocationGateEnabled: false,
  },
  recency: {
    maxAgeDays: 45,
  },
  thresholds: {
    minTotalScore: 40,
  },
  phraseGate: {
    requirePrimaryOrIndustry: true,
  },
} satisfies AdminMatchConfigForm

function num(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function bool(value: boolean | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Merge a partial override (e.g. from DB) into a complete admin form shape. */
export function normalizeMatchConfigForm(
  src: MatchConfigOverride | undefined | null,
): AdminMatchConfigForm {
  const base = DEFAULT_ADMIN_MATCH_CONFIG
  const phrase = src?.phrase
  const pay = src?.pay
  const location = src?.location
  const bands = location?.bandQualities
  const tier = phrase?.tierFactors
  const surfaces = phrase?.surfaceWeights

  return {
    categoryWeights: {
      phrase: num(src?.categoryWeights?.phrase, base.categoryWeights.phrase),
      pay: num(src?.categoryWeights?.pay, base.categoryWeights.pay),
      location: num(src?.categoryWeights?.location, base.categoryWeights.location),
      recency: num(src?.categoryWeights?.recency, base.categoryWeights.recency),
    },
    phrase: {
      minPrimaryWords: num(phrase?.minPrimaryWords, base.phrase.minPrimaryWords),
      tierFactors: {
        primary: num(tier?.primary, base.phrase.tierFactors.primary),
        industry: num(tier?.industry, base.phrase.tierFactors.industry),
        secondary: num(tier?.secondary, base.phrase.tierFactors.secondary),
      },
      surfaceWeights: {
        title: num(surfaces?.title, base.phrase.surfaceWeights.title),
        description: num(surfaces?.description, base.phrase.surfaceWeights.description),
        briefing: num(surfaces?.briefing, base.phrase.surfaceWeights.briefing),
      },
    },
    pay: {
      missingSalaryQuality: num(pay?.missingSalaryQuality, base.pay.missingSalaryQuality),
      nearRangeQuality: num(pay?.nearRangeQuality, base.pay.nearRangeQuality),
      aboveRangeQuality: num(pay?.aboveRangeQuality, base.pay.aboveRangeQuality),
      overToleranceFraction: num(pay?.overToleranceFraction, base.pay.overToleranceFraction),
      underToleranceFraction: num(pay?.underToleranceFraction, base.pay.underToleranceFraction),
      hardFloorEnabled: bool(pay?.hardFloorEnabled, base.pay.hardFloorEnabled),
      hardFloorFraction: num(pay?.hardFloorFraction, base.pay.hardFloorFraction),
    },
    location: {
      bandQualities: {
        d0to10: num(bands?.d0to10, base.location.bandQualities.d0to10),
        d10to25: num(bands?.d10to25, base.location.bandQualities.d10to25),
        d25to50: num(bands?.d25to50, base.location.bandQualities.d25to50),
        d50to100: num(bands?.d50to100, base.location.bandQualities.d50to100),
        dBeyond100: num(bands?.dBeyond100, base.location.bandQualities.dBeyond100),
      },
      sameMetroQuality: num(location?.sameMetroQuality, base.location.sameMetroQuality),
      sameStateQuality: num(location?.sameStateQuality, base.location.sameStateQuality),
      remoteAsPerfect: bool(location?.remoteAsPerfect, base.location.remoteAsPerfect),
      relocationGateEnabled: bool(
        location?.relocationGateEnabled,
        base.location.relocationGateEnabled,
      ),
    },
    recency: {
      maxAgeDays: num(src?.recency?.maxAgeDays, base.recency.maxAgeDays),
    },
    thresholds: {
      minTotalScore: num(src?.thresholds?.minTotalScore, base.thresholds.minTotalScore),
    },
    phraseGate: {
      requirePrimaryOrIndustry: bool(
        src?.phraseGate?.requirePrimaryOrIndustry,
        base.phraseGate.requirePrimaryOrIndustry,
      ),
    },
  }
}

export function matchConfigFormToOverride(form: AdminMatchConfigForm): MatchConfigOverride {
  return JSON.parse(JSON.stringify(form)) as MatchConfigOverride
}

function deepCloneConfig(src: AdminMatchConfigForm): AdminMatchConfigForm {
  return JSON.parse(JSON.stringify(src)) as AdminMatchConfigForm
}

export function categoryWeightSum(cfg: AdminMatchConfigForm | MatchConfigOverride): number {
  const w = cfg.categoryWeights
  if (!w) return 0
  return (w.phrase ?? 0) + (w.pay ?? 0) + (w.location ?? 0) + (w.recency ?? 0)
}

export function phraseSurfaceWeightSum(cfg: AdminMatchConfigForm | MatchConfigOverride): number {
  const sw = cfg.phrase?.surfaceWeights
  if (!sw) return 0
  return (sw.title ?? 0) + (sw.description ?? 0) + (sw.briefing ?? 0)
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
      const message = await parseFunctionsInvokeError(error)
      return { data: null, error: new Error(message) }
    }

    const dataError = errorMessageFromInvokeData(data)
    if (dataError) {
      return { data: null, error: new Error(dataError) }
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
      const message = await parseFunctionsInvokeError(error)
      return { error: new Error(message) }
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

export { deepCloneConfig }
