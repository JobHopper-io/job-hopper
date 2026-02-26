export interface SubscriberPreferences {
  roles: string[]
  currentJobTitle?: string | null
  currentIndustry?: string | null
  payRangeMin?: number | null
  payRangeMax?: number | null
  preferredLocations?: string[] | null
  openToRelocation?: boolean | null
  openToRemote?: boolean | null
}

export interface JobRecord {
  id: number
  title: string | null
  companyName: string | null
  location: string | null
  description: string | null
  jobHighlights: string | null
  applyLink: string | null
  createdAt: string
}

export interface RankedJob extends JobRecord {
  score: number
  roleScore: number
  locationScore: number
  recencyScore: number
  matchedRoleKeywords: string[]
}

export interface MatchJobsDebugSampleJob {
  id: number
  title: string | null
  companyName: string | null
  location: string | null
  reason: 'role' | 'remote' | 'location'
}

export interface MatchJobsDebug {
  input: {
    roles: string[]
    currentJobTitle?: string | null
    currentIndustry?: string | null
    preferredLocations: string[]
    openToRelocation: boolean
    openToRemote: boolean
    roleKeywords: string[]
  }
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
  samples: {
    excludedByRole: MatchJobsDebugSampleJob[]
    excludedByRemote: MatchJobsDebugSampleJob[]
    excludedByLocation: MatchJobsDebugSampleJob[]
  }
}

interface MatchJobsInternalCollector {
  roleKeywords: string[]
  preferredLocations: string[]
  openToRelocation: boolean
  openToRemote: boolean
  totalJobs: number
  excludedByRole: number
  excludedByRemoteOptOut: number
  excludedByLocation: number
  includedAfterFilters: number
  scoreSum: number
  roleScoreSum: number
  locationScoreSum: number
  recencyScoreSum: number
  minScore: number | null
  maxScore: number | null
  sampleLimit: number
  excludedByRoleSamples: MatchJobsDebugSampleJob[]
  excludedByRemoteSamples: MatchJobsDebugSampleJob[]
  excludedByLocationSamples: MatchJobsDebugSampleJob[]
  keywordMatchCounts: Map<string, number>
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase()
}

function extractKeywords(...inputs: (string | null | undefined)[]): string[] {
  const set = new Set<string>()

  for (const input of inputs) {
    if (!input) continue

    const words = input
      .toLowerCase()
      .split(/[^a-z0-9+/#]+/i)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2)

    for (const w of words) {
      set.add(w)
    }
  }

  return Array.from(set)
}

function coreMatchJobs(
  subscriber: SubscriberPreferences,
  jobs: JobRecord[],
  collector?: MatchJobsInternalCollector,
): RankedJob[] {
  const roleKeywords = new Set<string>()

  for (const role of subscriber.roles ?? []) {
    const keywords = extractKeywords(role)
    for (const kw of keywords) {
      roleKeywords.add(kw)
    }
  }

  if (subscriber.currentJobTitle) {
    const keywords = extractKeywords(subscriber.currentJobTitle)
    for (const kw of keywords) {
      roleKeywords.add(kw)
    }
  }

  if (subscriber.currentIndustry) {
    const keywords = extractKeywords(subscriber.currentIndustry)
    for (const kw of keywords) {
      roleKeywords.add(kw)
    }
  }

  const roleKeywordsArray = Array.from(roleKeywords)

  const preferredLocations = (subscriber.preferredLocations ?? [])
    .filter((loc) => !!loc)
    .map((loc) => loc.toLowerCase())

  const relocationWilling = !!subscriber.openToRelocation
  const wantsRemote = !!subscriber.openToRemote

  const nowMs = Date.now()

  if (collector) {
    collector.roleKeywords = roleKeywordsArray
    collector.preferredLocations = preferredLocations
    collector.openToRelocation = relocationWilling
    collector.openToRemote = wantsRemote
    collector.totalJobs = jobs.length
  }

  const ranked: RankedJob[] = []

  for (const job of jobs) {
    const titleText = normalizeText(job.title)
    const descText = normalizeText(job.description)
    const highlightsText = normalizeText(job.jobHighlights)
    const combinedText = `${titleText} ${descText} ${highlightsText}`.trim()

    let roleScore = 0
    const matchedRoleKeywords: string[] = []

    if (roleKeywords.size > 0 && combinedText.length > 0) {
      for (const kw of roleKeywords) {
        if (combinedText.includes(kw)) {
          matchedRoleKeywords.push(kw)
          const inTitle = titleText.includes(kw)
          roleScore += inTitle ? 2 : 1
        }
      }
    }

    // If subscriber has specified role-related keywords, require at least one match
    if (roleKeywords.size > 0 && roleScore === 0) {
      if (collector) {
        collector.excludedByRole += 1
        if (collector.excludedByRoleSamples.length < collector.sampleLimit) {
          collector.excludedByRoleSamples.push({
            id: job.id,
            title: job.title,
            companyName: job.companyName,
            location: job.location,
            reason: 'role',
          })
        }
      }
      continue
    }

    const jobLocation = normalizeText(job.location)
    const isRemote =
      jobLocation.includes('remote') ||
      jobLocation.includes('anywhere') ||
      jobLocation.includes('work from home')

    // Remote jobs are only considered if the subscriber has explicitly opted in.
    if (isRemote && !wantsRemote) {
      if (collector) {
        collector.excludedByRemoteOptOut += 1
        if (collector.excludedByRemoteSamples.length < collector.sampleLimit) {
          collector.excludedByRemoteSamples.push({
            id: job.id,
            title: job.title,
            companyName: job.companyName,
            location: job.location,
            reason: 'remote',
          })
        }
      }
      continue
    }

    let locationScore = 0
    let locationIncluded = true

    if (preferredLocations.length > 0) {
      let isPreferred = false
      for (const pref of preferredLocations) {
        if (jobLocation.includes(pref) || pref.includes(jobLocation)) {
          isPreferred = true
          break
        }
      }

      if (isPreferred) {
        // Same metro/state (approximate via substring match)
        locationScore = 2
      } else if (relocationWilling && jobLocation) {
        // Other locations allowed, but with lower rank
        locationScore = 1
      } else {
        // Location preference but job does not match and subscriber is not willing to relocate
        locationIncluded = false
      }
    } else if (isRemote && wantsRemote) {
      // No explicit location preference: include remote jobs only if allowed, with a mild boost
      locationScore = 1
    }

    if (!locationIncluded) {
      if (collector) {
        collector.excludedByLocation += 1
        if (collector.excludedByLocationSamples.length < collector.sampleLimit) {
          collector.excludedByLocationSamples.push({
            id: job.id,
            title: job.title,
            companyName: job.companyName,
            location: job.location,
            reason: 'location',
          })
        }
      }
      continue
    }

    // Pay range rule:
    // - If structured salary is available on the job and subscriber has a desired range,
    //   we would filter by overlapping ranges (with tolerance).
    // - In the current schema, job_hopper_live does not expose structured salary,
    //   so we intentionally do not exclude any jobs based on pay to avoid over-filtering.

    let recencyScore = 0
    if (job.createdAt) {
      const createdMs = Date.parse(job.createdAt)
      if (!Number.isNaN(createdMs)) {
        const days = (nowMs - createdMs) / (1000 * 60 * 60 * 24)
        const windowDays = 30
        // Score between 0 and 1, decaying linearly over 30 days
        recencyScore = Math.max(0, 1 - days / windowDays)
      }
    }

    const totalScore = roleScore * 10 + locationScore * 3 + recencyScore

    if (collector) {
      collector.includedAfterFilters += 1
      collector.scoreSum += totalScore
      collector.roleScoreSum += roleScore
      collector.locationScoreSum += locationScore
      collector.recencyScoreSum += recencyScore

      if (collector.minScore === null || totalScore < collector.minScore) {
        collector.minScore = totalScore
      }
      if (collector.maxScore === null || totalScore > collector.maxScore) {
        collector.maxScore = totalScore
      }

      for (const kw of matchedRoleKeywords) {
        const prev = collector.keywordMatchCounts.get(kw) ?? 0
        collector.keywordMatchCounts.set(kw, prev + 1)
      }
    }

    ranked.push({
      ...job,
      score: totalScore,
      roleScore,
      locationScore,
      recencyScore,
      matchedRoleKeywords,
    })
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }

    const aMs = Date.parse(a.createdAt)
    const bMs = Date.parse(b.createdAt)

    if (!Number.isNaN(aMs) && !Number.isNaN(bMs)) {
      return bMs - aMs
    }

    return 0
  })

  return ranked
}

export function matchJobs(
  subscriber: SubscriberPreferences,
  jobs: JobRecord[],
): RankedJob[] {
  return coreMatchJobs(subscriber, jobs)
}

export function matchJobsWithDebug(
  subscriber: SubscriberPreferences,
  jobs: JobRecord[],
): { ranked: RankedJob[]; debug: MatchJobsDebug } {
  const collector: MatchJobsInternalCollector = {
    roleKeywords: [],
    preferredLocations: [],
    openToRelocation: false,
    openToRemote: false,
    totalJobs: 0,
    excludedByRole: 0,
    excludedByRemoteOptOut: 0,
    excludedByLocation: 0,
    includedAfterFilters: 0,
    scoreSum: 0,
    roleScoreSum: 0,
    locationScoreSum: 0,
    recencyScoreSum: 0,
    minScore: null,
    maxScore: null,
    sampleLimit: 10,
    excludedByRoleSamples: [],
    excludedByRemoteSamples: [],
    excludedByLocationSamples: [],
    keywordMatchCounts: new Map<string, number>(),
  }

  const ranked = coreMatchJobs(subscriber, jobs, collector)

  const included = collector.includedAfterFilters

  const scores = {
    minScore: collector.minScore,
    maxScore: collector.maxScore,
    averageScore: included > 0 ? collector.scoreSum / included : null,
    averageRoleScore: included > 0 ? collector.roleScoreSum / included : null,
    averageLocationScore:
      included > 0 ? collector.locationScoreSum / included : null,
    averageRecencyScore:
      included > 0 ? collector.recencyScoreSum / included : null,
  }

  const keywords = Array.from(collector.keywordMatchCounts.entries())
    .map(([keyword, matchedJobCount]) => ({ keyword, matchedJobCount }))
    .sort((a, b) => b.matchedJobCount - a.matchedJobCount)
    .slice(0, 25)

  const debug: MatchJobsDebug = {
    input: {
      roles: subscriber.roles ?? [],
      currentJobTitle: subscriber.currentJobTitle ?? null,
      currentIndustry: subscriber.currentIndustry ?? null,
      preferredLocations: collector.preferredLocations,
      openToRelocation: collector.openToRelocation,
      openToRemote: collector.openToRemote,
      roleKeywords: collector.roleKeywords,
    },
    filters: {
      totalJobs: collector.totalJobs,
      excludedByRole: collector.excludedByRole,
      excludedByRemoteOptOut: collector.excludedByRemoteOptOut,
      excludedByLocation: collector.excludedByLocation,
      includedAfterFilters: collector.includedAfterFilters,
    },
    scores,
    keywords,
    samples: {
      excludedByRole: collector.excludedByRoleSamples,
      excludedByRemote: collector.excludedByRemoteSamples,
      excludedByLocation: collector.excludedByLocationSamples,
    },
  }

  return { ranked, debug }
}

