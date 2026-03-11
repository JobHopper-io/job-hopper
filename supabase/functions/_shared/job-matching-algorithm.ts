export interface SubscriberPreferences {
  roles: string[]
  currentJobTitle: string | null
  currentIndustry: string | null
  payRangeMin: number | null
  payRangeMax: number | null
  preferredLocations: string[]
  openToRelocation: boolean | null
  openToRemote: boolean | null
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
}

export interface MatchConfigRoleWeights {
  titleExact: number
  titleKeyword: number
  roleCategoryExact: number
  currentJobTitleKeyword: number
  currentIndustryKeyword: number
}

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
}

export interface MatchConfigRecencyWeights {
  baseRecency: number
  perDayDecay: number
  maxAgeDays: number
}

export interface MatchConfigThresholds {
  minTotalScore: number
  hardRoleMismatchPenalty: number
  overPayTolerancePct: number
  underPayTolerancePct: number
}

export interface MatchConfigDebug {
  includeReasonBreakdown: boolean
}

export interface MatchConfig {
  roleWeights: MatchConfigRoleWeights
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
  matchedRoleKeywords?: string[]
}

export const defaultConfig: MatchConfig = {
  roleWeights: {
    titleExact: 8,
    titleKeyword: 3,
    roleCategoryExact: 10,
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
    hardRoleMismatchPenalty: -100,
    overPayTolerancePct: 0.25,
    underPayTolerancePct: 0.15,
  },
  debug: {
    includeReasonBreakdown: false,
  },
}

export function mergeConfig(overrides: Partial<MatchConfig> | null | undefined): MatchConfig {
  if (!overrides) return defaultConfig

  return {
    ...defaultConfig,
    ...overrides,
    roleWeights: {
      ...defaultConfig.roleWeights,
      ...(overrides.roleWeights ?? {}),
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

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase()
}

function extractKeywords(input: string | null | undefined): string[] {
  if (!input) return []
  return input
    .toLowerCase()
    .split(/[^a-z0-9+/#]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
}

function uniqueKeywords(...inputs: (string | null | undefined)[]): string[] {
  const set = new Set<string>()
  for (const input of inputs) {
    for (const kw of extractKeywords(input)) {
      set.add(kw)
    }
  }
  return Array.from(set)
}

function computeRoleScore(
  prefs: SubscriberPreferences,
  job: JobRecord,
  cfg: MatchConfig,
): number {
  const title = normalizeText(job.title)
  const description = normalizeText(job.description)
  const briefing = normalizeText(job.aiBriefing)
  const combined = `${title} ${description} ${briefing}`.trim()

  const roleKeywords = new Set<string>()
  for (const role of prefs.roles) {
    for (const kw of extractKeywords(role)) {
      roleKeywords.add(kw)
    }
  }

  const currentTitleKeywords = uniqueKeywords(prefs.currentJobTitle)
  const currentIndustryKeywords = uniqueKeywords(prefs.currentIndustry)

  let score = 0

  if (job.roleCategory && prefs.roles.length > 0) {
    const lowerCategory = job.roleCategory.toLowerCase()
    for (const role of prefs.roles) {
      if (lowerCategory === role.toLowerCase()) {
        score += cfg.roleWeights.roleCategoryExact
        break
      }
    }
  }

  if (combined.length > 0 && roleKeywords.size > 0) {
    for (const kw of roleKeywords) {
      if (combined.includes(kw)) {
        const inTitle = title.includes(kw)
        score += inTitle ? cfg.roleWeights.titleExact : cfg.roleWeights.titleKeyword
      }
    }
  }

  if (combined.length > 0 && currentTitleKeywords.length > 0) {
    for (const kw of currentTitleKeywords) {
      if (combined.includes(kw)) {
        score += cfg.roleWeights.currentJobTitleKeyword
      }
    }
  }

  if (combined.length > 0 && currentIndustryKeywords.length > 0) {
    for (const kw of currentIndustryKeywords) {
      if (combined.includes(kw)) {
        score += cfg.roleWeights.currentIndustryKeyword
      }
    }
  }

  if (roleKeywords.size > 0 || currentTitleKeywords.length > 0) {
    const anyOverlap = score > 0
    if (!anyOverlap) {
      score += cfg.thresholds.hardRoleMismatchPenalty
    }
  }

  return score
}

function computeRoleScoreWithKeywords(
  prefs: SubscriberPreferences,
  job: JobRecord,
  cfg: MatchConfig,
): { score: number; matchedRoleKeywords: string[] } {
  const title = normalizeText(job.title)
  const description = normalizeText(job.description)
  const briefing = normalizeText(job.aiBriefing)
  const combined = `${title} ${description} ${briefing}`.trim()

  const roleKeywords = new Set<string>()
  for (const role of prefs.roles) {
    for (const kw of extractKeywords(role)) {
      roleKeywords.add(kw)
    }
  }

  const currentTitleKeywords = uniqueKeywords(prefs.currentJobTitle)
  const currentIndustryKeywords = uniqueKeywords(prefs.currentIndustry)

  let score = 0
  const matchedRoleKeywords: string[] = []

  if (job.roleCategory && prefs.roles.length > 0) {
    const lowerCategory = job.roleCategory.toLowerCase()
    for (const role of prefs.roles) {
      if (lowerCategory === role.toLowerCase()) {
        score += cfg.roleWeights.roleCategoryExact
        break
      }
    }
  }

  if (combined.length > 0 && roleKeywords.size > 0) {
    for (const kw of roleKeywords) {
      if (combined.includes(kw)) {
        const inTitle = title.includes(kw)
        score += inTitle ? cfg.roleWeights.titleExact : cfg.roleWeights.titleKeyword
        matchedRoleKeywords.push(kw)
      }
    }
  }

  if (combined.length > 0 && currentTitleKeywords.length > 0) {
    for (const kw of currentTitleKeywords) {
      if (combined.includes(kw)) {
        score += cfg.roleWeights.currentJobTitleKeyword
      }
    }
  }

  if (combined.length > 0 && currentIndustryKeywords.length > 0) {
    for (const kw of currentIndustryKeywords) {
      if (combined.includes(kw)) {
        score += cfg.roleWeights.currentIndustryKeyword
      }
    }
  }

  if (roleKeywords.size > 0 || currentTitleKeywords.length > 0) {
    const anyOverlap = score > 0
    if (!anyOverlap) {
      score += cfg.thresholds.hardRoleMismatchPenalty
    }
  }

  return { score, matchedRoleKeywords }
}

function normalizeAnnualFromJob(job: JobRecord): { min: number | null; max: number | null } {
  const { payMin, payMax, payType } = job
  if (payMin == null && payMax == null) {
    return { min: null, max: null }
  }

  const type = payType ?? 'annual'
  const multiplier =
    type === 'hourly'
      ? 2080
      : type === 'weekly'
        ? 52
        : type === 'monthly'
          ? 12
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

function computeLocationScore(
  prefs: SubscriberPreferences,
  job: JobRecord,
  cfg: MatchConfig,
): number {
  const normalizedJobLocation = normalizeText(job.location)
  const isRemote = job.isRemote
  const prefersRemote = !!prefs.openToRemote

  const preferredLocations = (prefs.preferredLocations ?? [])
    .filter((loc) => loc)
    .map((loc) => loc.toLowerCase())

  let score = 0

  if (isRemote && prefersRemote) {
    score += cfg.locationWeights.remotePreferred
  }

  if (preferredLocations.length === 0) {
    return score
  }

  let matchedPreferred = false
  for (const pref of preferredLocations) {
    if (normalizedJobLocation.includes(pref) || pref.includes(normalizedJobLocation)) {
      matchedPreferred = true
      score += cfg.locationWeights.sameMetro
      break
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

function computeRecencyScore(job: JobRecord, cfg: MatchConfig, nowMs: number): number {
  const ts = job.postedDate ?? job.createdAt
  if (!ts) return 0

  const dateMs = Date.parse(ts)
  if (Number.isNaN(dateMs)) return 0

  const days = (nowMs - dateMs) / (1000 * 60 * 60 * 24)
  if (days > cfg.recencyWeights.maxAgeDays) {
    return -Infinity
  }

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
    const roleScore = computeRoleScore(prefs, job, cfg)
    if (roleScore <= cfg.thresholds.hardRoleMismatchPenalty / 2) {
      continue
    }

    const payScore = computePayScore(prefs, job, cfg)
    const locationScore = computeLocationScore(prefs, job, cfg)
    const recencyScore = computeRecencyScore(job, cfg, nowMs)

    if (recencyScore === -Infinity) {
      continue
    }

    const totalScore = roleScore + payScore + locationScore + recencyScore
    if (totalScore < cfg.thresholds.minTotalScore) {
      continue
    }

    const base: RankedJob = {
      ...job,
      score: totalScore,
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
  }
  keywords: {
    keyword: string
    matchedJobCount: number
  }[]
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

  let excludedByRole = 0
  let excludedByRemoteOptOut = 0
  let excludedByLocation = 0

  const ranked: RankedJob[] = []

  let minScore: number | null = null
  let maxScore: number | null = null
  let sumScore = 0
  let sumRoleScore = 0
  let sumLocationScore = 0
  let sumRecencyScore = 0

  const keywordCounts = new Map<string, number>()

  for (const job of jobs) {
    const { score: roleScore, matchedRoleKeywords } = computeRoleScoreWithKeywords(prefs, job, cfg)

    if (roleScore <= cfg.thresholds.hardRoleMismatchPenalty / 2) {
      excludedByRole += 1
      continue
    }

    const isRemote = job.isRemote
    if (isRemote && prefs.openToRemote === false) {
      excludedByRemoteOptOut += 1
      continue
    }

    const payScore = computePayScore(prefs, job, cfg)
    const locationScore = computeLocationScore(prefs, job, cfg)
    const recencyScore = computeRecencyScore(job, cfg, nowMs)

    if (recencyScore === -Infinity) {
      excludedByLocation += 1
      continue
    }

    const totalScore = roleScore + payScore + locationScore + recencyScore
    if (totalScore < cfg.thresholds.minTotalScore) {
      continue
    }

    const rankedJob: RankedJob = {
      ...job,
      score: totalScore,
      components: {
        role: roleScore,
        pay: payScore,
        location: locationScore,
        recency: recencyScore,
      },
      matchedRoleKeywords,
    }

    ranked.push(rankedJob)

    if (minScore === null || totalScore < minScore) minScore = totalScore
    if (maxScore === null || totalScore > maxScore) maxScore = totalScore
    sumScore += totalScore
    sumRoleScore += roleScore
    sumLocationScore += locationScore
    sumRecencyScore += recencyScore

    for (const kw of matchedRoleKeywords) {
      keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1)
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

  const debug: MatchJobsDebugPayload = {
    filters: {
      totalJobs: jobs.length,
      excludedByRole,
      excludedByRemoteOptOut,
      excludedByLocation,
      includedAfterFilters: count,
    },
    scores: {
      minScore,
      maxScore,
      averageScore: count > 0 ? sumScore / count : null,
      averageRoleScore: count > 0 ? sumRoleScore / count : null,
      averageLocationScore: count > 0 ? sumLocationScore / count : null,
      averageRecencyScore: count > 0 ? sumRecencyScore / count : null,
    },
    keywords: Array.from(keywordCounts.entries())
      .sort(([, aCount], [, bCount]) => bCount - aCount)
      .slice(0, 50)
      .map(([keyword, matchedJobCount]) => ({ keyword, matchedJobCount })),
  }

  return { ranked, debug }
}

