// Reverse-recruiting shortlist: open (and recent likely-open) jobs, with "why this fits" bullets built
// from facts we hold. No AI, no sponsorship claims, nothing inferred beyond the two records.
import type { RankedJob } from './job-matching-algorithm.ts'
import type { ProspectMatchingFields } from './prospect-matching.ts'
import type { VacancyResult } from './job-vacancy.ts'

export const SHORTLIST_MAX = 5
export const SHORTLIST_MIN = 3

const LEVEL_LABELS: Record<string, string> = {
  entry_mid: 'Entry & Mid Level',
  senior_management: 'Senior & Management',
  director_vp_c_level: 'Director, VP & C-Level',
}

// Words too generic to call a title "overlap" on their own.
const GENERIC = new Set([
  'a', 'an', 'and', 'of', 'the', 'for', 'to', 'in', 'at', 'with', '&', '-', '/',
  'engineer', 'manager', 'specialist', 'associate', 'senior', 'sr', 'jr', 'junior', 'lead', 'staff',
  'principal', 'i', 'ii', 'iii', 'iv', 'remote', 'hybrid', 'onsite',
])

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean)
}

/** Distinctive words shared by the prospect's target title and the job title. */
export function sharedTitleWords(target: string, jobTitle: string): string[] {
  const jobWords = new Set(words(jobTitle))
  return [...new Set(words(target))].filter((w) => !GENERIC.has(w) && jobWords.has(w))
}

function titleBullet(target: string | null, jobTitle: string | null): string | null {
  const t = target?.trim()
  if (!t || !jobTitle) return null
  if (jobTitle.toLowerCase().includes(t.toLowerCase())) return `Title matches your target role (${t})`
  const shared = sharedTitleWords(t, jobTitle)
  return shared.length ? `Title shares "${shared.join(' ')}" with your target role (${t})` : null
}

function locationBullet(prospect: ProspectMatchingFields, job: RankedJob): string | null {
  if (job.isRemote) return prospect.open_to_remote ? "Remote role, and you're open to remote work" : null
  const loc = job.location?.trim()
  if (!loc) return null
  const hit = (prospect.preferred_locations ?? []).find((p) => {
    const pref = p.trim()
    if (!pref || /^remote$/i.test(pref)) return false
    return new RegExp(`(^|[^A-Za-z])${pref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`, 'i').test(loc)
  })
  return hit ? `Based in ${loc}, which is in your preferred locations (${hit.trim()})` : null
}

function levelBullet(careerLevel: string | null, job: RankedJob): string | null {
  if (!careerLevel || job.subscriptionTier !== careerLevel) return null
  return `${LEVEL_LABELS[careerLevel] ?? careerLevel} role, matching your experience level`
}

/** Up to 3 fact-only bullets, in order: title, remote/location, level. Fewer when facts are missing. */
export function fallbackWhyFit(prospect: ProspectMatchingFields, job: RankedJob): string[] {
  return [
    titleBullet(prospect.target_job_title, job.title),
    locationBullet(prospect, job),
    levelBullet(prospect.career_level, job),
  ].filter((b): b is string => b !== null).slice(0, 3)
}

export interface ShortlistItem {
  jobId: string
  title: string | null
  company: string | null
  location: string | null
  applyLink: string | null
  postedDate: string | null
  score: number
  bullets: string[]
  vacancy: VacancyResult
}

export interface Shortlist {
  /** 'ready' when at least SHORTLIST_MIN jobs made the list (open, plus recent likely_open). */
  status: 'ready' | 'too_few'
  items: ShortlistItem[]
}

/** A likely_open job (page data only) is shortlisted only if it was posted this recently. */
export const LIKELY_OPEN_MAX_AGE_DAYS = 21

function isIndeed(job: RankedJob, vacancy: VacancyResult): boolean {
  if (vacancy.host === 'indeed') return true
  try {
    return /(^|\.)indeed\.com$/i.test(new URL(job.applyLink ?? '').hostname)
  } catch {
    return false
  }
}

function postedWithin(job: RankedJob, days: number, nowMs: number): boolean {
  const ms = job.postedDate ? Date.parse(job.postedDate) : NaN
  return !Number.isNaN(ms) && nowMs - ms <= days * 86_400_000
}

/**
 * Open jobs first (score order), then likely_open jobs posted within LIKELY_OPEN_MAX_AGE_DAYS
 * (score order), capped at SHORTLIST_MAX. Closed, unverified and Indeed jobs never make it in.
 */
export function assembleShortlist(
  prospect: ProspectMatchingFields,
  checked: { job: RankedJob; vacancy: VacancyResult }[],
  nowMs: number = Date.now(),
): Shortlist {
  const eligible = checked.filter((c) => !isIndeed(c.job, c.vacancy))
  const open = eligible.filter((c) => c.vacancy.status === 'open')
  const likely = eligible.filter(
    (c) => c.vacancy.status === 'likely_open' && postedWithin(c.job, LIKELY_OPEN_MAX_AGE_DAYS, nowMs),
  )
  const items = [...open, ...likely]
    .slice(0, SHORTLIST_MAX)
    .map(({ job, vacancy }) => ({
      jobId: job.id,
      title: job.title,
      company: job.companyName,
      location: job.isRemote ? (job.location ? `${job.location} (remote)` : 'Remote') : job.location,
      applyLink: job.applyLink,
      postedDate: job.postedDate,
      score: job.score,
      bullets: fallbackWhyFit(prospect, job),
      vacancy,
    }))
  return { status: items.length >= SHORTLIST_MIN ? 'ready' : 'too_few', items }
}

/**
 * Verify candidates in score order until SHORTLIST_MAX are open or candidates run out.
 * `verify` is injected (and may be cached by the caller across prospects).
 */
export async function verifyUntilEnough(
  candidates: RankedJob[],
  verify: (job: RankedJob) => Promise<VacancyResult>,
): Promise<{ job: RankedJob; vacancy: VacancyResult }[]> {
  const checked: { job: RankedJob; vacancy: VacancyResult }[] = []
  let open = 0
  for (const job of candidates) {
    if (open >= SHORTLIST_MAX) break
    const vacancy = await verify(job)
    checked.push({ job, vacancy })
    if (vacancy.status === 'open') open++
  }
  return checked
}
