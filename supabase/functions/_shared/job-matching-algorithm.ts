import { normalizeLocationInput } from './location-normalization.ts'
import {
  getEffectiveSponsorshipLikelihood,
  inferSponsorshipLikelihood,
  type JobDataForInference,
} from './infer-sponsorship-likelihood.ts'
import type { MatchSynonymEntry } from './match-synonym-row.ts'
import { computeFilterMatchesQuality } from './filter-matching.ts'
import {
  buildPhraseEvaluationContext,
  evaluatePhraseMatch,
  evaluatePhraseMatchWithContext,
  getAllProfilePhrasesForDebug,
  effectiveJobTitleForKeywords as effectiveJobTitleForKeywordsFromPhrase,
  type MatchConfigPhrase,
  type PhraseEvaluationContext,
  type PhraseMatchDetails,
  type PhraseMatchJobSurfaces,
  type PhraseMatchSubscriberInput,
} from './phrase-matching.ts'

export { computeFilterMatchesQuality, computeRoleCategoryMatchQuality } from './filter-matching.ts'

export { getEffectiveSponsorshipLikelihood, inferSponsorshipLikelihood }
export type { MatchConfigPhrase, PhraseMatchDetails }

export interface MatchJobsRunOptions {
  synonyms?: MatchSynonymEntry[]
}

export interface SubscriberPreferences {
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
  subscriptionTier: string | null
  employeeCount?: number | null
  sponsorshipLikelihood?: 'Low' | 'Medium' | 'High' | 'N/A' | null
}

export interface MatchConfigCategoryWeights {
  phrase: number
  pay: number
  location: number
  recency: number
  filterMatches: number
}

export interface MatchConfigPay {
  missingSalaryQuality: number
  nearRangeQuality: number
  aboveRangeQuality: number
  overToleranceFraction: number
  underToleranceFraction: number
  hardFloorEnabled: boolean
  hardFloorFraction: number
}

export interface MatchConfigLocationBandQualities {
  d0to10: number
  d10to25: number
  d25to50: number
  d50to100: number
  dBeyond100: number
}

export interface MatchConfigLocation {
  bandQualities: MatchConfigLocationBandQualities
  sameMetroQuality: number
  sameStateQuality: number
  remoteAsPerfect: boolean
  relocationGateEnabled: boolean
}

export interface MatchConfigRecency {
  maxAgeDays: number
}

export interface MatchConfigThresholds {
  minTotalScore: number
}

export interface MatchConfigPhraseGate {
  requirePrimaryOrIndustry: boolean
}

export interface MatchConfigDebug {
  includeReasonBreakdown: boolean
}

export interface MatchConfig {
  categoryWeights: MatchConfigCategoryWeights
  phrase: MatchConfigPhrase
  pay: MatchConfigPay
  location: MatchConfigLocation
  recency: MatchConfigRecency
  thresholds: MatchConfigThresholds
  phraseGate: MatchConfigPhraseGate
  debug: MatchConfigDebug
}

export interface RankedJob extends JobRecord {
  /** Total match score on 0–100 scale. */
  score: number
  components?: {
    phrase: number
    pay: number
    location: number
    recency: number
    filterMatches: number
  }
  /** Points contributed per category on 0–100 scale (categoryWeight × quality × 100). */
  scoreContributions?: {
    phrase: number
    pay: number
    location: number
    recency: number
    filterMatches: number
  }
  phraseMatch?: PhraseMatchDetails
  locationDistanceMiles?: number | null
  withinRadius?: boolean
  locationParsed?: boolean
  effectiveSponsorshipLikelihood?: 'Low' | 'Medium' | 'High'
}

export const defaultConfig: MatchConfig = {
  categoryWeights: {
    phrase: 0.45,
    pay: 0.15,
    location: 0.25,
    recency: 0.1,
    filterMatches: 0.05,
  },
  phrase: {
    tierFactors: { primary: 1, industry: 0.7, secondary: 0.4 },
    surfaceWeights: { title: 0.6, description: 0.3, briefing: 0.1 },
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
  debug: {
    includeReasonBreakdown: false,
  },
}

function mergeNested<T extends object>(base: T, override: Partial<T> | undefined): T {
  if (!override) return { ...base }
  return { ...base, ...override }
}

export function mergeConfig(overrides: Partial<MatchConfig> | null | undefined): MatchConfig {
  if (!overrides) return defaultConfig

  return {
    categoryWeights: mergeNested(defaultConfig.categoryWeights, overrides.categoryWeights),
    phrase: mergeNested(defaultConfig.phrase, {
      ...overrides.phrase,
      tierFactors: mergeNested(
        defaultConfig.phrase.tierFactors,
        overrides.phrase?.tierFactors,
      ),
      surfaceWeights: mergeNested(
        defaultConfig.phrase.surfaceWeights,
        overrides.phrase?.surfaceWeights,
      ),
    }),
    pay: mergeNested(defaultConfig.pay, overrides.pay),
    location: mergeNested(defaultConfig.location, {
      ...overrides.location,
      bandQualities: mergeNested(
        defaultConfig.location.bandQualities,
        overrides.location?.bandQualities,
      ),
    }),
    recency: mergeNested(defaultConfig.recency, overrides.recency),
    thresholds: mergeNested(defaultConfig.thresholds, overrides.thresholds),
    phraseGate: mergeNested(defaultConfig.phraseGate, overrides.phraseGate),
    debug: mergeNested(defaultConfig.debug, overrides.debug),
  }
}

/** Theoretical maximum total score is always 100 on the bounded scale. */
export function getMaxPossibleScore(): number {
  return 100
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

function jobMatchesSubscriptionTier(job: JobRecord, prefs: SubscriberPreferences): boolean {
  if (prefs.subscriptionTierProductKeys.length === 0) return false
  const tier = job.subscriptionTier
  if (tier == null || tier === '') return false
  return prefs.subscriptionTierProductKeys.includes(tier)
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

function computePayQuality(
  prefs: SubscriberPreferences,
  job: JobRecord,
  cfg: MatchConfig,
): number {
  const userMin = prefs.payRangeMin
  const userMax = prefs.payRangeMax
  const { min: jobMin, max: jobMax } = normalizeAnnualFromJob(job)
  const pay = cfg.pay

  if (userMin == null || userMax == null || jobMin == null || jobMax == null) {
    return pay.missingSalaryQuality
  }

  const overlapMin = Math.max(userMin, jobMin)
  const overlapMax = Math.min(userMax, jobMax)
  if (overlapMin <= overlapMax) {
    return 1
  }

  const userCenter = (userMin + userMax) / 2
  const jobCenter = (jobMin + jobMax) / 2
  const diff = jobCenter - userCenter
  const diffPct = diff / userCenter

  if (diffPct > 0 && diffPct <= pay.overToleranceFraction) {
    return pay.aboveRangeQuality
  }

  if (diffPct < 0 && Math.abs(diffPct) <= pay.underToleranceFraction) {
    return pay.nearRangeQuality
  }

  if (diffPct < 0 && Math.abs(diffPct) > pay.underToleranceFraction) {
    return 0
  }

  return pay.aboveRangeQuality
}

/** Hard gate: job pay is more than hardFloorFraction below user minimum. */
export function failsPayHardFloor(
  prefs: SubscriberPreferences,
  job: JobRecord,
  cfg: MatchConfig,
): boolean {
  if (!cfg.pay.hardFloorEnabled) return false
  const userMin = prefs.payRangeMin
  if (userMin == null) return false
  const { min: jobMin, max: jobMax } = normalizeAnnualFromJob(job)
  if (jobMin == null && jobMax == null) return false
  const jobTop = jobMax ?? jobMin
  if (jobTop == null) return false
  const floor = userMin * (1 - cfg.pay.hardFloorFraction)
  return jobTop < floor
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
  const R = 3959
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function bandQualityForDistance(miles: number, bands: MatchConfigLocationBandQualities): number {
  const d = Math.max(0, miles)
  if (d <= 10) return bands.d0to10
  if (d <= 25) return bands.d10to25
  if (d <= 50) return bands.d25to50
  if (d <= 100) return bands.d50to100
  return bands.dBeyond100
}

/**
 * Location quality from nearest preferred place (miles) and subscriber radius.
 * Inside radius → 1.0. Outside → admin band weights apply to miles beyond the radius.
 * If radius is unset, bands use absolute distance (legacy fallback).
 */
export function locationQualityFromDistance(
  minDistanceMiles: number,
  locationRadiusMiles: number | null,
  bands: MatchConfigLocationBandQualities,
): { quality: number; withinRadius: boolean } {
  const radius =
    locationRadiusMiles != null && locationRadiusMiles > 0 ? locationRadiusMiles : null

  if (radius != null && minDistanceMiles <= radius) {
    return { quality: 1, withinRadius: true }
  }

  const milesBeyondRadius = radius != null ? minDistanceMiles - radius : minDistanceMiles
  return {
    quality: bandQualityForDistance(milesBeyondRadius, bands),
    withinRadius: false,
  }
}

/**
 * Subscriber-side location work hoisted out of the per-job loop:
 * preferred locations are normalized once and reused across all jobs.
 */
export interface LocationEvaluationContext {
  prefersRemote: boolean
  remoteAsPerfect: boolean
  sameMetroQuality: number
  sameStateQuality: number
  bands: MatchConfigLocationBandQualities
  locationRadiusMiles: number | null
  hasPreferredLocations: boolean
  preferred: NormalizedWithCoords[]
  preferredNormalizedNames: string[]
  hasAnyPreferredCoords: boolean
}

export function buildLocationEvaluationContext(
  prefs: SubscriberPreferences,
  cfg: MatchConfig,
): LocationEvaluationContext {
  const preferredLocationsRaw = prefs.preferredLocations ?? []
  const preferred = preferredLocationsRaw
    .map((l) => normalizeWithCoords(l))
    .filter((p) => p.normalized)

  return {
    prefersRemote: !!prefs.openToRemote,
    remoteAsPerfect: cfg.location.remoteAsPerfect,
    sameMetroQuality: cfg.location.sameMetroQuality,
    sameStateQuality: cfg.location.sameStateQuality,
    bands: cfg.location.bandQualities,
    locationRadiusMiles: prefs.locationRadiusMiles,
    hasPreferredLocations: preferredLocationsRaw.length > 0,
    preferred,
    preferredNormalizedNames: preferred.map((p) => p.normalized ?? '').filter((s) => s.length > 0),
    hasAnyPreferredCoords: preferred.some((p) => p.lat != null && p.lon != null),
  }
}

function computeCategoricalLocationQualityWithContext(
  ctx: LocationEvaluationContext,
  job: JobRecord,
): number {
  const isRemote = job.isRemote

  if (isRemote && ctx.prefersRemote && ctx.remoteAsPerfect) {
    return 1
  }

  if (ctx.preferredNormalizedNames.length === 0) {
    return 0
  }

  const normalizedJobLocation = normalizeLocationInput(job.location ?? '').normalized ?? ''
  if (!normalizedJobLocation) return 0

  for (const pref of ctx.preferredNormalizedNames) {
    if (normalizedJobLocation.includes(pref) || pref.includes(normalizedJobLocation)) {
      return ctx.sameMetroQuality
    }
  }

  const jobTokens = normalizedJobLocation.split(/[^a-z0-9]+/i).filter((t) => t.length > 0)
  for (const token of jobTokens) {
    for (const pref of ctx.preferredNormalizedNames) {
      if (pref.includes(token) || token.includes(pref)) {
        return ctx.sameStateQuality
      }
    }
  }

  return 0
}

export function computeLocationQualityWithContext(
  ctx: LocationEvaluationContext,
  job: JobRecord,
): { quality: number; distanceMiles: number | null; withinRadius: boolean; parsed: boolean } {
  const isRemote = job.isRemote

  if (isRemote && ctx.prefersRemote && ctx.remoteAsPerfect) {
    return { quality: 1, distanceMiles: null, withinRadius: false, parsed: false }
  }

  if (!ctx.hasPreferredLocations) {
    const jobNorm = normalizeWithCoords(job.location ?? '')
    return { quality: 0, distanceMiles: null, withinRadius: false, parsed: jobNorm.parsed }
  }

  const jobNorm = normalizeWithCoords(job.location ?? '')
  const hasJobCoords = jobNorm.lat != null && jobNorm.lon != null

  if (!hasJobCoords || !ctx.hasAnyPreferredCoords) {
    return {
      quality: computeCategoricalLocationQualityWithContext(ctx, job),
      distanceMiles: null,
      withinRadius: false,
      parsed: jobNorm.parsed,
    }
  }

  let minDistance = Infinity
  for (const pref of ctx.preferred) {
    if (pref.lat == null || pref.lon == null) continue
    const d = haversineMiles(
      pref.lat,
      pref.lon,
      jobNorm.lat as number,
      jobNorm.lon as number,
    )
    if (d < minDistance) minDistance = d
  }

  if (!Number.isFinite(minDistance)) {
    return {
      quality: computeCategoricalLocationQualityWithContext(ctx, job),
      distanceMiles: null,
      withinRadius: false,
      parsed: jobNorm.parsed,
    }
  }

  const { quality, withinRadius } = locationQualityFromDistance(
    minDistance,
    ctx.locationRadiusMiles,
    ctx.bands,
  )
  return { quality, distanceMiles: minDistance, withinRadius, parsed: jobNorm.parsed }
}


/** Hard gate: far job when relocation gate enabled and user not open to relocation/remote. */
export function failsRelocationGate(
  prefs: SubscriberPreferences,
  job: JobRecord,
  distanceMiles: number | null,
  cfg: MatchConfig,
): boolean {
  if (!cfg.location.relocationGateEnabled) return false
  if (job.isRemote) return false
  if (prefs.openToRelocation) return false
  if (distanceMiles == null) return false
  return distanceMiles > 100
}

export function getRecencyCutoffIso(maxAgeDays: number, nowMs: number = Date.now()): string {
  const cutoffMs = nowMs - maxAgeDays * 24 * 60 * 60 * 1000
  return new Date(cutoffMs).toISOString()
}

export function jobExceedsMaxAge(job: JobRecord, cfg: MatchConfig, nowMs: number = Date.now()): boolean {
  const ts = job.postedDate ?? job.createdAt
  if (!ts) return false

  const dateMs = Date.parse(ts)
  if (Number.isNaN(dateMs)) return false

  const days = (nowMs - dateMs) / (1000 * 60 * 60 * 24)
  return days > cfg.recency.maxAgeDays
}

function computeRecencyQuality(job: JobRecord, cfg: MatchConfig, nowMs: number): number {
  const ts = job.postedDate ?? job.createdAt
  if (!ts) return 0

  const dateMs = Date.parse(ts)
  if (Number.isNaN(dateMs)) return 0

  const days = (nowMs - dateMs) / (1000 * 60 * 60 * 24)
  const maxDays = Math.max(1, cfg.recency.maxAgeDays)
  return Math.max(0, 1 - days / maxDays)
}

export interface JobMatchQualities {
  phraseRelevance: number
  payQuality: number
  locationQuality: number
  recencyQuality: number
  filterMatchesQuality: number
  phraseMatch: PhraseMatchDetails
  locationDistanceMiles: number | null
  withinRadius: boolean
  locationParsed: boolean
}

function effectiveCategoryWeights(cfg: MatchConfig): MatchConfigCategoryWeights {
  return { ...defaultConfig.categoryWeights, ...cfg.categoryWeights }
}

function totalScoreFromQualities(qualities: JobMatchQualities, cfg: MatchConfig): {
  score: number
  components: RankedJob['components']
  scoreContributions: RankedJob['scoreContributions']
} {
  const w = effectiveCategoryWeights(cfg)
  const components = {
    phrase: qualities.phraseRelevance,
    pay: qualities.payQuality,
    location: qualities.locationQuality,
    recency: qualities.recencyQuality,
    filterMatches: qualities.filterMatchesQuality,
  }
  const scoreContributions = {
    phrase: 100 * w.phrase * qualities.phraseRelevance,
    pay: 100 * w.pay * qualities.payQuality,
    location: 100 * w.location * qualities.locationQuality,
    recency: 100 * w.recency * qualities.recencyQuality,
    filterMatches: 100 * w.filterMatches * qualities.filterMatchesQuality,
  }
  const score =
    scoreContributions.phrase +
    scoreContributions.pay +
    scoreContributions.location +
    scoreContributions.recency +
    scoreContributions.filterMatches
  return {
    score: Math.round(score * 100) / 100,
    components,
    scoreContributions,
  }
}

function passesPhraseGate(
  hasSearchIntent: boolean,
  passesGate: boolean,
  cfg: MatchConfig,
): boolean {
  if (!cfg.phraseGate.requirePrimaryOrIndustry) return true
  if (!hasSearchIntent) return true
  return passesGate
}

function parseRecencyMs(job: JobRecord): number {
  const ts = job.postedDate ?? job.createdAt
  if (!ts) return 0
  const ms = Date.parse(ts)
  return Number.isNaN(ms) ? 0 : ms
}

function compareByScoreThenRecency(
  a: RankedJob & { _sortMs?: number },
  b: RankedJob & { _sortMs?: number },
): number {
  if (b.score !== a.score) return b.score - a.score
  const aMs = a._sortMs ?? parseRecencyMs(a)
  const bMs = b._sortMs ?? parseRecencyMs(b)
  return bMs - aMs
}

export function matchJobs(
  prefs: SubscriberPreferences,
  jobs: JobRecord[],
  overrides?: Partial<MatchConfig> | null,
  runOptions?: MatchJobsRunOptions,
): RankedJob[] {
  const cfg = mergeConfig(overrides)
  const synonyms = runOptions?.synonyms ?? []
  const nowMs = Date.now()
  const ranked: (RankedJob & { _sortMs?: number })[] = []

  const phraseCtx = buildPhraseEvaluationContext(prefsToPhraseInput(prefs), cfg.phrase, synonyms)
  const locationCtx = buildLocationEvaluationContext(prefs, cfg)
  const w = effectiveCategoryWeights(cfg)
  const minScoreThreshold = cfg.thresholds.minTotalScore

  for (const job of jobs) {
    if (!jobMatchesSubscriptionTier(job, prefs)) continue
    if (jobExceedsMaxAge(job, cfg, nowMs)) continue
    if (job.isRemote && prefs.openToRemote === false) continue

    const { phraseRelevance, phraseMatch, passesGate, hasSearchIntent } =
      evaluatePhraseMatchWithContext(phraseCtx, jobToPhraseSurfaces(job))
    if (!passesPhraseGate(hasSearchIntent, passesGate, cfg)) continue
    if (failsPayHardFloor(prefs, job, cfg)) continue

    const payQuality = computePayQuality(prefs, job, cfg)
    const recencyQuality = computeRecencyQuality(job, cfg, nowMs)
    const filterMatchesQuality = computeFilterMatchesQuality(prefs.roles, job.roleCategory)

    // Score upper-bound short-circuit: if even with location quality = 1 the total
    // can't reach the threshold, skip the (relatively expensive) location work.
    const upperBoundWithoutLocation =
      100 *
      (w.phrase * phraseRelevance +
        w.pay * payQuality +
        w.recency * recencyQuality +
        w.filterMatches * filterMatchesQuality +
        w.location * 1)
    if (upperBoundWithoutLocation < minScoreThreshold) continue

    const locationResult = computeLocationQualityWithContext(locationCtx, job)

    if (failsRelocationGate(prefs, job, locationResult.distanceMiles, cfg)) continue

    const qualities: JobMatchQualities = {
      phraseRelevance,
      payQuality,
      locationQuality: locationResult.quality,
      recencyQuality,
      filterMatchesQuality,
      phraseMatch,
      locationDistanceMiles: locationResult.distanceMiles,
      withinRadius: locationResult.withinRadius,
      locationParsed: locationResult.parsed,
    }

    const { score, components, scoreContributions } = totalScoreFromQualities(qualities, cfg)
    if (score < minScoreThreshold) continue

    const effectiveSponsorship = getEffectiveSponsorshipLikelihood(
      job.sponsorshipLikelihood ?? 'N/A',
      toJobDataForInference(job),
    )

    const base: RankedJob & { _sortMs?: number } = {
      ...job,
      score,
      effectiveSponsorshipLikelihood: effectiveSponsorship,
      _sortMs: parseRecencyMs(job),
    }

    if (cfg.debug.includeReasonBreakdown) {
      base.components = components
      base.scoreContributions = scoreContributions
      base.phraseMatch = phraseMatch
      base.locationDistanceMiles = qualities.locationDistanceMiles
      base.withinRadius = qualities.withinRadius
      base.locationParsed = qualities.locationParsed
    }

    ranked.push(base)
  }

  ranked.sort(compareByScoreThenRecency)
  for (const r of ranked) delete r._sortMs

  return ranked
}

export interface MatchJobsDebugPayload {
  filters: {
    totalJobs: number
    excludedBySubscriptionTier: number
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
    averageFilterMatchesQuality: number | null
    maxPossibleScore: number
  }
  phrases: {
    phrase: string
    kind: 'primary' | 'discriminating' | 'industry'
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
  runOptions?: MatchJobsRunOptions,
): { ranked: RankedJob[]; debug: MatchJobsDebugPayload } {
  const cfg = mergeConfig({
    ...overrides,
    debug: { includeReasonBreakdown: true },
  })
  const synonyms = runOptions?.synonyms ?? []
  const nowMs = Date.now()

  let excludedBySubscriptionTier = 0
  let excludedByRemoteOptOut = 0
  let excludedByRecency = 0
  let excludedByPhraseGate = 0
  let excludedByPayHardFloor = 0
  let excludedByRelocationGate = 0
  let excludedByMinTotalScore = 0

  const ranked: (RankedJob & { _sortMs?: number })[] = []

  let minScore: number | null = null
  let maxScore: number | null = null
  let sumScore = 0
  let sumPhrase = 0
  let sumPay = 0
  let sumLocation = 0
  let sumRecency = 0
  let sumFilterMatches = 0

  const phraseDebugList = getAllProfilePhrasesForDebug(prefsToPhraseInput(prefs))
  const phraseCounts = new Map<string, number>()
  const phraseKey = (kind: string, phrase: string) => `${kind}\x1f${phrase}`
  for (const { phrase, kind } of phraseDebugList) {
    phraseCounts.set(phraseKey(kind, phrase), 0)
  }

  const matchSurfaces = { title: 0, description: 0, briefing: 0 }

  const phraseCtx = buildPhraseEvaluationContext(prefsToPhraseInput(prefs), cfg.phrase, synonyms)
  const locationCtx = buildLocationEvaluationContext(prefs, cfg)

  for (const job of jobs) {
    if (!jobMatchesSubscriptionTier(job, prefs)) {
      excludedBySubscriptionTier += 1
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

    const { phraseRelevance, phraseMatch, passesGate, hasSearchIntent } =
      evaluatePhraseMatchWithContext(phraseCtx, jobToPhraseSurfaces(job))

    if (!passesPhraseGate(hasSearchIntent, passesGate, cfg)) {
      excludedByPhraseGate += 1
      continue
    }

    if (failsPayHardFloor(prefs, job, cfg)) {
      excludedByPayHardFloor += 1
      continue
    }

    const payQuality = computePayQuality(prefs, job, cfg)
    const recencyQuality = computeRecencyQuality(job, cfg, nowMs)
    const filterMatchesQuality = computeFilterMatchesQuality(prefs.roles, job.roleCategory)

    const locationResult = computeLocationQualityWithContext(locationCtx, job)

    if (failsRelocationGate(prefs, job, locationResult.distanceMiles, cfg)) {
      excludedByRelocationGate += 1
      continue
    }

    const qualities: JobMatchQualities = {
      phraseRelevance,
      payQuality,
      locationQuality: locationResult.quality,
      recencyQuality,
      filterMatchesQuality,
      phraseMatch,
      locationDistanceMiles: locationResult.distanceMiles,
      withinRadius: locationResult.withinRadius,
      locationParsed: locationResult.parsed,
    }

    const { score, components, scoreContributions } = totalScoreFromQualities(qualities, cfg)

    if (score < cfg.thresholds.minTotalScore) {
      excludedByMinTotalScore += 1
      continue
    }

    const effectiveSponsorship = getEffectiveSponsorshipLikelihood(
      job.sponsorshipLikelihood ?? 'N/A',
      toJobDataForInference(job),
    )

    const rankedJob: RankedJob & { _sortMs?: number } = {
      ...job,
      score,
      components,
      scoreContributions,
      phraseMatch,
      locationDistanceMiles: qualities.locationDistanceMiles,
      withinRadius: qualities.withinRadius,
      locationParsed: qualities.locationParsed,
      effectiveSponsorshipLikelihood: effectiveSponsorship,
      _sortMs: parseRecencyMs(job),
    }

    ranked.push(rankedJob)

    if (minScore === null || score < minScore) minScore = score
    if (maxScore === null || score > maxScore) maxScore = score
    sumScore += score
    sumPhrase += components.phrase
    sumPay += components.pay
    sumLocation += components.location
    sumRecency += components.recency
    sumFilterMatches += components.filterMatches

    for (const [tier, bySurf] of Object.entries(phraseMatch.matchedBySurface)) {
      const kind = tier as 'primary' | 'discriminating' | 'industry'
      if (!bySurf) continue
      for (const phrase of Object.values(bySurf)) {
        if (!phrase) continue
        const key = phraseKey(kind, phrase)
        phraseCounts.set(key, (phraseCounts.get(key) ?? 0) + 1)
      }
    }

    for (const surface of ['title', 'description', 'briefing'] as const) {
      let hit = false
      for (const tier of ['primary', 'discriminating', 'industry'] as const) {
        if (phraseMatch.surfaceScores[tier][surface] > 0) {
          hit = true
          break
        }
      }
      if (hit) matchSurfaces[surface] += 1
    }
  }

  ranked.sort(compareByScoreThenRecency)
  for (const r of ranked) delete r._sortMs

  const count = ranked.length

  const debug: MatchJobsDebugPayload = {
    filters: {
      totalJobs: jobs.length,
      excludedBySubscriptionTier,
      excludedByRemoteOptOut,
      excludedByRecency,
      excludedByPhraseGate,
      excludedByPayHardFloor,
      excludedByRelocationGate,
      excludedByMinTotalScore,
      includedAfterFilters: count,
    },
    scores: {
      minScore,
      maxScore,
      averageScore: count > 0 ? sumScore / count : null,
      averagePhraseQuality: count > 0 ? sumPhrase / count : null,
      averagePayQuality: count > 0 ? sumPay / count : null,
      averageLocationQuality: count > 0 ? sumLocation / count : null,
      averageRecencyQuality: count > 0 ? sumRecency / count : null,
      averageFilterMatchesQuality: count > 0 ? sumFilterMatches / count : null,
      maxPossibleScore: getMaxPossibleScore(),
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
