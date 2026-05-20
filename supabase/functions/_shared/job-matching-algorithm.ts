import { normalizeLocationInput } from './location-normalization.ts'
import {
  getEffectiveSponsorshipLikelihood,
  inferSponsorshipLikelihood,
  type JobDataForInference,
} from './infer-sponsorship-likelihood.ts'
import {
  evaluatePhraseMatch,
  getAllProfilePhrasesForDebug,
  getMaxPhraseScore,
  effectiveJobTitleForKeywords as effectiveJobTitleForKeywordsFromPhrase,
  type MatchConfigPhraseMatching,
  type MatchConfigPhraseWeights,
  type PhraseMatchDetails,
  type PhraseMatchJobSurfaces,
  type PhraseMatchSubscriberInput,
} from './phrase-matching.ts'

export { getEffectiveSponsorshipLikelihood, inferSponsorshipLikelihood }

export interface SubscriberPreferences {
  /** `products.key` for base_plan rows on the subscriber's active subscriptions; must align with `job_hopper_live.subscription_tier`. */
  subscriptionTierProductKeys: string[]
  roles: string[]
  /** When set (non-empty), title keywords are derived from this; otherwise {@link currentJobTitle} is used. */
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

export interface JobRecord {
  id: string
  title: string | null
  companyName: string | null
  roleCategory: string | null
  location: string | null
  isRemote: boolean
  description: string | null
  aiBriefing: string | null
  applyLink: string | null
  payMin: number | null
  payMax: number | null
  payType: string | null
  createdAt: string
  postedDate: string | null
  /** `job_hopper_live.subscription_tier` → `products.key` */
  subscriptionTier: string | null
  /** Optional: used for sponsorship inference when sponsorshipLikelihood is N/A */
  employeeCount?: number | null
  /** Optional: stored value from DB; when N/A, inference is used */
  sponsorshipLikelihood?: 'Low' | 'Medium' | 'High' | 'N/A' | null
}

export type { MatchConfigPhraseMatching, MatchConfigPhraseWeights, PhraseMatchDetails }

export interface MatchConfigPayWeights {
  insideRange: number
  nearRange: number
  missingSalary: number
  belowRangePenalty: number
}

export interface MatchConfigLocationWeights {
  sameMetro: number
  sameState: number
  remotePreferred: number
  relocationAllowed: number
  otherLocationPenalty: number
  distance0to10: number
  distance10to25: number
  distance25to50: number
  distance50to100: number
  distanceBeyond100: number
  withinRadiusBonus: number
}

export interface MatchConfigRecencyWeights {
  baseRecency: number
  perDayDecay: number
  maxAgeDays: number
}

export interface MatchConfigThresholds {
  minTotalScore: number
  /** When user has title/industry keywords but job matches none, this penalty is applied so the job is excluded. */
  noKeywordMatchPenalty: number
  overPayTolerancePct: number
  underPayTolerancePct: number
}

export interface MatchConfigDebug {
  includeReasonBreakdown: boolean
}

export interface MatchConfig {
  phraseWeights: MatchConfigPhraseWeights
  phraseMatching: MatchConfigPhraseMatching
  payWeights: MatchConfigPayWeights
  locationWeights: MatchConfigLocationWeights
  recencyWeights: MatchConfigRecencyWeights
  thresholds: MatchConfigThresholds
  debug: MatchConfigDebug
}

export interface RankedJob extends JobRecord {
  score: number
  components?: {
    role: number
    pay: number
    location: number
    recency: number
  }
  phraseMatch?: PhraseMatchDetails
  locationDistanceMiles?: number | null
  withinRadius?: boolean
  locationParsed?: boolean
  /** Effective sponsorship likelihood: stored value if not N/A, else inferred from job data */
  effectiveSponsorshipLikelihood?: 'Low' | 'Medium' | 'High'
}

export const defaultConfig: MatchConfig = {
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
  debug: {
    includeReasonBreakdown: false,
  },
}

export function mergeConfig(overrides: Partial<MatchConfig> | null | undefined): MatchConfig {
  if (!overrides) return defaultConfig

  const ow = overrides.phraseWeights
  const defPw = defaultConfig.phraseWeights
  const phraseWeights: MatchConfigPhraseWeights = {
    primary: { ...defPw.primary, ...(ow?.primary ?? {}) },
    secondary: { ...defPw.secondary, ...(ow?.secondary ?? {}) },
    industry: { ...defPw.industry, ...(ow?.industry ?? {}) },
  }

  return {
    ...defaultConfig,
    ...overrides,
    phraseWeights,
    phraseMatching: {
      ...defaultConfig.phraseMatching,
      ...(overrides.phraseMatching ?? {}),
    },
    payWeights: {
      ...defaultConfig.payWeights,
      ...(overrides.payWeights ?? {}),
    },
    locationWeights: {
      ...defaultConfig.locationWeights,
      ...(overrides.locationWeights ?? {}),
    },
    recencyWeights: {
      ...defaultConfig.recencyWeights,
      ...(overrides.recencyWeights ?? {}),
    },
    thresholds: {
      ...defaultConfig.thresholds,
      ...(overrides.thresholds ?? {}),
    },
    debug: {
      ...defaultConfig.debug,
      ...(overrides.debug ?? {}),
    },
  }
}

function toJobDataForInference(job: JobRecord): JobDataForInference {
  return {
    title: job.title,
    companyName: job.companyName,
    roleCategory: job.roleCategory,
    location: job.location,
    description: job.description,
    aiBriefing: job.aiBriefing,
    employeeCount: job.employeeCount ?? null,
  }
}

/**
 * Text used for job-title phrase extraction: trimmed target title when present,
 * otherwise the subscriber's current job title (non-empty after trim).
 */
export function effectiveJobTitleForKeywords(prefs: SubscriberPreferences): string | null {
  return effectiveJobTitleForKeywordsFromPhrase({
    targetJobTitle: prefs.targetJobTitle,
    currentJobTitle: prefs.currentJobTitle,
    currentIndustry: prefs.currentIndustry,
  })
}

function prefsToPhraseInput(prefs: SubscriberPreferences): PhraseMatchSubscriberInput {
  return {
    targetJobTitle: prefs.targetJobTitle,
    currentJobTitle: prefs.currentJobTitle,
    currentIndustry: prefs.currentIndustry,
  }
}

function jobToPhraseSurfaces(job: JobRecord): PhraseMatchJobSurfaces {
  return {
    title: job.title,
    description: job.description,
    aiBriefing: job.aiBriefing,
  }
}

function computePhraseRoleScore(
  prefs: SubscriberPreferences,
  job: JobRecord,
  cfg: MatchConfig,
): { roleScore: number; phraseMatch: PhraseMatchDetails } {
  const { phraseScore, phraseMatch, passesGate, hasSearchIntent } = evaluatePhraseMatch(
    prefsToPhraseInput(prefs),
    jobToPhraseSurfaces(job),
    cfg.phraseWeights,
    cfg.phraseMatching,
  )
  let roleScore = phraseScore
  if (hasSearchIntent && !passesGate) {
    roleScore += cfg.thresholds.noKeywordMatchPenalty
  }
  return { roleScore, phraseMatch }
}

/** True if the job's catalog tier matches one of the subscriber's base plan product keys. */
function jobMatchesSubscriptionTier(job: JobRecord, prefs: SubscriberPreferences): boolean {
  if (prefs.subscriptionTierProductKeys.length === 0) {
    return false
  }
  const tier = job.subscriptionTier
  if (tier == null || tier === '') {
    return false
  }
  return prefs.subscriptionTierProductKeys.includes(tier)
}

/** True if job is in scope: user has no target roles, or job's role_category is one of them. */
function jobMatchesTargetRoles(job: JobRecord, prefs: SubscriberPreferences): boolean {
  if (prefs.roles.length === 0) return true
  if (!job.roleCategory) return false
  const lowerCategory = job.roleCategory.toLowerCase()
  return prefs.roles.some((role) => role.toLowerCase() === lowerCategory)
}

/**
 * Highest possible total score for the given prefs and config (theoretical maximum).
 * Used to show score as percentage of max on the admin job-matching page.
 */
export function getMaxPossibleScore(prefs: SubscriberPreferences, cfg: MatchConfig): number {
  const maxPhrase = getMaxPhraseScore(prefsToPhraseInput(prefs), cfg.phraseWeights, cfg.phraseMatching)
  const maxPay = cfg.payWeights.insideRange
  const maxLocation = Math.max(
    cfg.locationWeights.sameMetro,
    cfg.locationWeights.sameState,
    cfg.locationWeights.remotePreferred + cfg.locationWeights.distance0to10,
    cfg.locationWeights.relocationAllowed + cfg.locationWeights.distance0to10,
    cfg.locationWeights.distance0to10 + cfg.locationWeights.withinRadiusBonus,
  )
  const maxRecency = cfg.recencyWeights.baseRecency
  return maxPhrase + maxPay + maxLocation + maxRecency
}

function normalizeAnnualFromJob(job: JobRecord): { min: number | null; max: number | null } {
  const { payMin, payMax, payType } = job
  if (payMin == null && payMax == null) {
    return { min: null, max: null }
  }

  const type = payType ?? 'year'
  const multiplier =
    type === 'hour' || type === 'hourly'
      ? 2080
      : type === 'week' || type === 'weekly'
        ? 52
        : type === 'month' || type === 'monthly'
          ? 12
          : type === 'day' || type === 'daily'
            ? 260
            : 1

  const rawMin = payMin ?? payMax
  const rawMax = payMax ?? payMin

  if (rawMin == null && rawMax == null) {
    return { min: null, max: null }
  }

  const min = rawMin != null ? rawMin * multiplier : null
  const max = rawMax != null ? rawMax * multiplier : min

  return { min, max }
}

function computePayScore(
  prefs: SubscriberPreferences,
  job: JobRecord,
  cfg: MatchConfig,
): number {
  const userMin = prefs.payRangeMin
  const userMax = prefs.payRangeMax
  const { min: jobMin, max: jobMax } = normalizeAnnualFromJob(job)

  if (userMin == null || userMax == null || jobMin == null || jobMax == null) {
    return cfg.payWeights.missingSalary
  }

  const overlapMin = Math.max(userMin, jobMin)
  const overlapMax = Math.min(userMax, jobMax)
  const hasOverlap = overlapMin <= overlapMax

  if (hasOverlap) {
    return cfg.payWeights.insideRange
  }

  const userCenter = (userMin + userMax) / 2
  const jobCenter = (jobMin + jobMax) / 2

  const diff = jobCenter - userCenter
  const diffPct = diff / userCenter

  if (diffPct > 0 && diffPct <= cfg.thresholds.overPayTolerancePct) {
    return cfg.payWeights.nearRange
  }

  if (diffPct < 0 && Math.abs(diffPct) <= cfg.thresholds.underPayTolerancePct) {
    return cfg.payWeights.nearRange
  }

  if (diffPct < 0 && Math.abs(diffPct) > cfg.thresholds.underPayTolerancePct) {
    return cfg.payWeights.belowRangePenalty
  }

  return 0
}

type NormalizedWithCoords = {
  normalized: string | null
  lat: number | null
  lon: number | null
  parsed: boolean
}

function normalizeWithCoords(raw: string | null | undefined): NormalizedWithCoords {
  const { normalized, latitude, longitude } = normalizeLocationInput(raw ?? '')
  return {
    normalized: normalized ?? null,
    lat: latitude ?? null,
    lon: longitude ?? null,
    parsed: normalized != null,
  }
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180
  const R = 3959 // Earth radius in miles
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function computeCategoricalLocationScore(
  prefs: SubscriberPreferences,
  job: JobRecord,
  cfg: MatchConfig,
): number {
  const normalizedJobLocation = normalizeLocationInput(job.location ?? '').normalized ?? ''
  const isRemote = job.isRemote
  const prefersRemote = !!prefs.openToRemote

  const preferredLocations = (prefs.preferredLocations ?? [])
    .map((loc) => normalizeLocationInput(loc ?? '').normalized ?? '')
    .filter((loc) => loc.length > 0)

  let score = 0

  if (isRemote && prefersRemote) {
    score += cfg.locationWeights.remotePreferred
  }

  if (preferredLocations.length === 0) {
    return score
  }

  let matchedPreferred = false
  if (normalizedJobLocation) {
    for (const pref of preferredLocations) {
      if (normalizedJobLocation.includes(pref) || pref.includes(normalizedJobLocation)) {
        matchedPreferred = true
        score += cfg.locationWeights.sameMetro
        break
      }
    }
  }

  if (!matchedPreferred && normalizedJobLocation) {
    const jobTokens = normalizedJobLocation.split(/[^a-z0-9]+/i).filter((t) => t.length > 0)
    for (const token of jobTokens) {
      for (const pref of preferredLocations) {
        if (pref.includes(token) || token.includes(pref)) {
          matchedPreferred = true
          score += cfg.locationWeights.sameState
          break
        }
      }
      if (matchedPreferred) {
        break
      }
    }
  }

  if (!matchedPreferred && !isRemote) {
    if (prefs.openToRelocation) {
      score += cfg.locationWeights.relocationAllowed
    } else {
      score += cfg.locationWeights.otherLocationPenalty
    }
  }

  return score
}

function computeLocationScore(
  prefs: SubscriberPreferences,
  job: JobRecord,
  cfg: MatchConfig,
): { score: number; distanceMiles: number | null; withinRadius: boolean; parsed: boolean } {
  const isRemote = job.isRemote
  const prefersRemote = !!prefs.openToRemote

  let score = 0

  if (isRemote && prefersRemote) {
    score += cfg.locationWeights.remotePreferred
  }

  const jobNorm = normalizeWithCoords(job.location ?? '')

  const preferredLocationsRaw = prefs.preferredLocations ?? []
  if (preferredLocationsRaw.length === 0) {
    return { score, distanceMiles: null, withinRadius: false, parsed: jobNorm.parsed }
  }
  const preferred = preferredLocationsRaw
    .map((loc) => normalizeWithCoords(loc))
    .filter((loc) => loc.normalized)

  const hasJobCoords = jobNorm.lat != null && jobNorm.lon != null
  const hasAnyPreferredCoords = preferred.some((p) => p.lat != null && p.lon != null)

  // If we don't have coordinates on either side, fall back to the old categorical rules.
  if (!hasJobCoords || !hasAnyPreferredCoords) {
    return {
      score: score + computeCategoricalLocationScore(prefs, job, cfg),
      distanceMiles: null,
      withinRadius: false,
      parsed: jobNorm.parsed,
    }
  }

  const distances: number[] = []
  for (const pref of preferred) {
    if (pref.lat == null || pref.lon == null) continue
    distances.push(haversineMiles(pref.lat, pref.lon, jobNorm.lat as number, jobNorm.lon as number))
  }

  if (distances.length === 0) {
    return {
      score: score + computeCategoricalLocationScore(prefs, job, cfg),
      distanceMiles: null,
      withinRadius: false,
      parsed: jobNorm.parsed,
    }
  }

  const minDistance = Math.min(...distances)
  let withinRadius = false

  // Distance band scoring
  if (minDistance <= 10) {
    score += cfg.locationWeights.distance0to10
  } else if (minDistance <= 25) {
    score += cfg.locationWeights.distance10to25
  } else if (minDistance <= 50) {
    score += cfg.locationWeights.distance25to50
  } else if (minDistance <= 100) {
    score += cfg.locationWeights.distance50to100
  } else {
    score += cfg.locationWeights.distanceBeyond100
  }

  // Radius bonus when inside user-selected radius
  if (prefs.locationRadiusMiles != null && prefs.locationRadiusMiles > 0) {
    if (minDistance <= prefs.locationRadiusMiles) {
      score += cfg.locationWeights.withinRadiusBonus
      withinRadius = true
    }
  }

  // If far away, non-remote, and user not open to relocation, apply penalty
  if (minDistance > 100 && !isRemote && !prefs.openToRelocation) {
    score += cfg.locationWeights.otherLocationPenalty
  } else if (minDistance > 100 && !isRemote && prefs.openToRelocation) {
    score += cfg.locationWeights.relocationAllowed
  }

  return { score, distanceMiles: minDistance, withinRadius, parsed: jobNorm.parsed }
}

/** ISO timestamp for jobs at or after the recency window (matches {@link jobExceedsMaxAge} / SQL prefilter). */
export function getRecencyCutoffIso(maxAgeDays: number, nowMs: number = Date.now()): string {
  const cutoffMs = nowMs - maxAgeDays * 24 * 60 * 60 * 1000
  return new Date(cutoffMs).toISOString()
}

/**
 * Hard recency filter: uses {@link JobRecord.postedDate} when set, otherwise {@link JobRecord.createdAt}.
 * Missing or unparseable dates are not treated as too old (same as legacy scoring behavior).
 */
export function jobExceedsMaxAge(job: JobRecord, cfg: MatchConfig, nowMs: number = Date.now()): boolean {
  const ts = job.postedDate ?? job.createdAt
  if (!ts) return false

  const dateMs = Date.parse(ts)
  if (Number.isNaN(dateMs)) return false

  const days = (nowMs - dateMs) / (1000 * 60 * 60 * 24)
  return days > cfg.recencyWeights.maxAgeDays
}

function computeRecencyScore(job: JobRecord, cfg: MatchConfig, nowMs: number): number {
  if (jobExceedsMaxAge(job, cfg, nowMs)) {
    return -Infinity
  }

  const ts = job.postedDate ?? job.createdAt
  if (!ts) return 0

  const dateMs = Date.parse(ts)
  if (Number.isNaN(dateMs)) return 0

  const days = (nowMs - dateMs) / (1000 * 60 * 60 * 24)
  const score = cfg.recencyWeights.baseRecency - days * cfg.recencyWeights.perDayDecay
  return score > 0 ? score : 0
}

export function matchJobs(
  prefs: SubscriberPreferences,
  jobs: JobRecord[],
  overrides?: Partial<MatchConfig> | null,
): RankedJob[] {
  const cfg = mergeConfig(overrides)
  const nowMs = Date.now()

  const ranked: RankedJob[] = []

  for (const job of jobs) {
    if (!jobMatchesSubscriptionTier(job, prefs)) {
      continue
    }

    if (!jobMatchesTargetRoles(job, prefs)) {
      continue
    }

    if (jobExceedsMaxAge(job, cfg, nowMs)) {
      continue
    }

    if (job.isRemote && prefs.openToRemote === false) {
      continue
    }

    const { roleScore } = computePhraseRoleScore(prefs, job, cfg)
    if (roleScore <= cfg.thresholds.noKeywordMatchPenalty / 2) {
      continue
    }

    const payScore = computePayScore(prefs, job, cfg)
    const { score: locationScore } = computeLocationScore(prefs, job, cfg)
    const recencyScore = computeRecencyScore(job, cfg, nowMs)

    const totalScore = roleScore + payScore + locationScore + recencyScore
    if (totalScore < cfg.thresholds.minTotalScore) {
      continue
    }

    const effectiveSponsorship = getEffectiveSponsorshipLikelihood(
      job.sponsorshipLikelihood ?? 'N/A',
      toJobDataForInference(job),
    )

    const base: RankedJob = {
      ...job,
      score: totalScore,
      effectiveSponsorshipLikelihood: effectiveSponsorship,
    }

    if (cfg.debug.includeReasonBreakdown) {
      base.components = {
        role: roleScore,
        pay: payScore,
        location: locationScore,
        recency: recencyScore,
      }
    }

    ranked.push(base)
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score

    const aMs = Date.parse(a.postedDate ?? a.createdAt)
    const bMs = Date.parse(b.postedDate ?? b.createdAt)

    if (!Number.isNaN(aMs) && !Number.isNaN(bMs)) {
      return bMs - aMs
    }

    return 0
  })

  return ranked
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
    averagePayScore: number | null
    averageLocationScore: number | null
    averageRecencyScore: number | null
    maxPossibleScore: number
  }
  phrases: {
    phrase: string
    kind: 'primary' | 'secondary' | 'industry'
    matchedJobCount: number
  }[]
  matchSurfaces: {
    title: number
    description: number
    briefing: number
  }
}

export function matchJobsWithDebug(
  prefs: SubscriberPreferences,
  jobs: JobRecord[],
  overrides?: Partial<MatchConfig> | null,
): { ranked: RankedJob[]; debug: MatchJobsDebugPayload } {
  const cfg = mergeConfig({
    ...overrides,
    debug: { includeReasonBreakdown: true },
  })
  const nowMs = Date.now()

  let excludedBySubscriptionTier = 0
  let excludedByRole = 0
  let excludedByRemoteOptOut = 0
  const excludedByLocation = 0
  let excludedByRecency = 0
  let excludedByNoKeywordMatch = 0
  let excludedByMinTotalScore = 0

  const ranked: RankedJob[] = []

  let minScore: number | null = null
  let maxScore: number | null = null
  let sumScore = 0
  let sumRoleScore = 0
  let sumPayScore = 0
  let sumLocationScore = 0
  let sumRecencyScore = 0

  const phraseDebugList = getAllProfilePhrasesForDebug(
    prefsToPhraseInput(prefs),
    cfg.phraseMatching,
  )
  const phraseCounts = new Map<string, number>()
  const phraseKey = (kind: string, phrase: string) => `${kind}\x1f${phrase}`
  for (const { phrase, kind } of phraseDebugList) {
    phraseCounts.set(phraseKey(kind, phrase), 0)
  }

  const matchSurfaces = { title: 0, description: 0, briefing: 0 }

  for (const job of jobs) {
    if (!jobMatchesSubscriptionTier(job, prefs)) {
      excludedBySubscriptionTier += 1
      continue
    }

    if (!jobMatchesTargetRoles(job, prefs)) {
      excludedByRole += 1
      continue
    }

    if (jobExceedsMaxAge(job, cfg, nowMs)) {
      excludedByRecency += 1
      continue
    }

    if (job.isRemote && prefs.openToRemote === false) {
      excludedByRemoteOptOut += 1
      continue
    }

    const { roleScore, phraseMatch } = computePhraseRoleScore(prefs, job, cfg)

    if (roleScore <= cfg.thresholds.noKeywordMatchPenalty / 2) {
      excludedByNoKeywordMatch += 1
      continue
    }

    const payScore = computePayScore(prefs, job, cfg)
    const {
      score: locationScore,
      distanceMiles,
      withinRadius,
      parsed: locationParsed,
    } = computeLocationScore(
      prefs,
      job,
      cfg,
    )
    const recencyScore = computeRecencyScore(job, cfg, nowMs)

    const totalScore = roleScore + payScore + locationScore + recencyScore
    if (totalScore < cfg.thresholds.minTotalScore) {
      excludedByMinTotalScore += 1
      continue
    }

    const effectiveSponsorship = getEffectiveSponsorshipLikelihood(
      job.sponsorshipLikelihood ?? 'N/A',
      toJobDataForInference(job),
    )

    const rankedJob: RankedJob = {
      ...job,
      score: totalScore,
      components: {
        role: roleScore,
        pay: payScore,
        location: locationScore,
        recency: recencyScore,
      },
      phraseMatch,
      locationDistanceMiles: distanceMiles,
      withinRadius,
      locationParsed,
      effectiveSponsorshipLikelihood: effectiveSponsorship,
    }

    ranked.push(rankedJob)

    if (minScore === null || totalScore < minScore) minScore = totalScore
    if (maxScore === null || totalScore > maxScore) maxScore = totalScore
    sumScore += totalScore
    sumRoleScore += roleScore
    sumPayScore += payScore
    sumLocationScore += locationScore
    sumRecencyScore += recencyScore

    for (const [tier, bySurf] of Object.entries(phraseMatch.matchedBySurface)) {
      const kind = tier as 'primary' | 'secondary' | 'industry'
      if (!bySurf) continue
      for (const phrase of Object.values(bySurf)) {
        if (!phrase) continue
        const key = phraseKey(kind, phrase)
        phraseCounts.set(key, (phraseCounts.get(key) ?? 0) + 1)
      }
    }

    for (const surface of ['title', 'description', 'briefing'] as const) {
      let hit = false
      for (const tier of ['primary', 'secondary', 'industry'] as const) {
        if (phraseMatch.surfaceScores[tier][surface] > 0) {
          hit = true
          break
        }
      }
      if (hit) matchSurfaces[surface] += 1
    }
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score

    const aMs = Date.parse(a.postedDate ?? a.createdAt)
    const bMs = Date.parse(b.postedDate ?? b.createdAt)

    if (!Number.isNaN(aMs) && !Number.isNaN(bMs)) {
      return bMs - aMs
    }

    return 0
  })

  const count = ranked.length
  const maxPossibleScore = getMaxPossibleScore(prefs, cfg)

  const debug: MatchJobsDebugPayload = {
    filters: {
      totalJobs: jobs.length,
      excludedBySubscriptionTier,
      excludedByRole,
      excludedByRemoteOptOut,
      excludedByLocation,
      excludedByRecency,
      excludedByNoKeywordMatch,
      excludedByMinTotalScore,
      includedAfterFilters: count,
    },
    scores: {
      minScore,
      maxScore,
      averageScore: count > 0 ? sumScore / count : null,
      averageRoleScore: count > 0 ? sumRoleScore / count : null,
      averagePayScore: count > 0 ? sumPayScore / count : null,
      averageLocationScore: count > 0 ? sumLocationScore / count : null,
      averageRecencyScore: count > 0 ? sumRecencyScore / count : null,
      maxPossibleScore,
    },
    phrases: Array.from(phraseCounts.entries())
      .map(([key, matchedJobCount]) => {
        const i = key.indexOf('\x1f')
        const kind = key.slice(0, i) as 'primary' | 'secondary' | 'industry'
        const phrase = key.slice(i + 1)
        return { phrase, kind, matchedJobCount }
      })
      .sort((a, b) => b.matchedJobCount - a.matchedJobCount),
    matchSurfaces,
  }

  return { ranked, debug }
}

