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

export function matchJobs(
  subscriber: SubscriberPreferences,
  jobs: JobRecord[],
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

  const preferredLocations = (subscriber.preferredLocations ?? [])
    .filter((loc) => !!loc)
    .map((loc) => loc.toLowerCase())

  const relocationWilling = !!subscriber.openToRelocation
  const wantsRemote = !!subscriber.openToRemote

  const nowMs = Date.now()

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
      continue
    }

    const jobLocation = normalizeText(job.location)
    const isRemote =
      jobLocation.includes('remote') ||
      jobLocation.includes('anywhere') ||
      jobLocation.includes('work from home')

    // Remote jobs are only considered if the subscriber has explicitly opted in.
    if (isRemote && !wantsRemote) {
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

