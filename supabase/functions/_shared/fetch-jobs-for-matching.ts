import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'
import {
  type JobRecord,
  type MatchConfig,
  type SubscriberPreferences,
  getRecencyCutoffIso,
  mergeConfig,
} from './job-matching-algorithm.ts'

export const JOB_HOPPER_LIVE_MATCH_SELECT = `
  id,
  job_title,
  company_name,
  role_category,
  location,
  is_remote,
  description,
  ai_job_briefing,
  apply_link,
  pay_min,
  pay_max,
  pay_type,
  created_at,
  posted_date,
  subscription_tier,
  employee_count,
  sponsorship_likelihood
`

export type JobHopperLiveRow = {
  id: string
  job_title: string | null
  company_name: string | null
  role_category: string | null
  location: string | null
  is_remote: boolean | null
  description: string | null
  ai_job_briefing: string | null
  apply_link: string | null
  pay_min: number | null
  pay_max: number | null
  pay_type: string | null
  created_at: string
  posted_date: string | null
  subscription_tier: string | null
  employee_count: number | null
  sponsorship_likelihood: 'Low' | 'Medium' | 'High' | 'N/A' | null
}

export function mapJobHopperLiveRowToRecord(row: JobHopperLiveRow): JobRecord {
  return {
    id: row.id,
    title: row.job_title ?? null,
    companyName: row.company_name ?? null,
    roleCategory: row.role_category ?? null,
    location: row.location ?? null,
    isRemote: !!row.is_remote,
    description: row.description ?? null,
    aiBriefing: row.ai_job_briefing ?? null,
    applyLink: row.apply_link ?? null,
    payMin: row.pay_min,
    payMax: row.pay_max,
    payType: row.pay_type,
    createdAt: row.created_at,
    postedDate: row.posted_date,
    subscriptionTier: row.subscription_tier ?? null,
    employeeCount: row.employee_count ?? null,
    sponsorshipLikelihood: row.sponsorship_likelihood ?? 'N/A',
  }
}

/**
 * PostgREST `.or()` filter mirroring {@link jobExceedsMaxAge}:
 * COALESCE(posted_date, created_at) >= cutoff, or both dates are null.
 */
export function buildRecencyOrFilter(maxAgeDays: number, nowMs: number = Date.now()): string {
  const cutoff = getRecencyCutoffIso(maxAgeDays, nowMs)
  return [
    `posted_date.gte.${cutoff}`,
    `and(posted_date.is.null,created_at.gte.${cutoff})`,
    `and(posted_date.is.null,created_at.is.null)`,
  ].join(',')
}

/** PostgREST query builder subset used for hard filters on job_hopper_live. */
export interface JobHopperLiveFilterableQuery {
  in(column: string, values: readonly string[]): JobHopperLiveFilterableQuery
  eq(column: string, value: boolean): JobHopperLiveFilterableQuery
  or(filters: string): JobHopperLiveFilterableQuery
}

/** Applies hard filters that can be expressed in SQL (tier, remote opt-out, maxAgeDays). */
export function applyJobMatchingHardFiltersToQuery<T extends JobHopperLiveFilterableQuery>(
  query: T,
  prefs: SubscriberPreferences,
  cfg: MatchConfig,
  nowMs: number = Date.now(),
): T {
  let q = query.in('subscription_tier', prefs.subscriptionTierProductKeys) as T

  if (prefs.openToRemote === false) {
    q = q.eq('is_remote', false) as T
  }

  q = q.or(buildRecencyOrFilter(cfg.recency.maxAgeDays, nowMs)) as T

  return q
}

export interface FetchJobRecordsForMatchingOptions {
  /** Cap rows loaded from the DB (e.g. admin test `?limit=`). */
  maxJobs?: number | null
  pageSize?: number
}

/**
 * Loads job_hopper_live rows with hard SQL filters before scoring.
 * Returns an empty array when the subscriber has no subscription tier keys.
 */
export async function fetchJobRecordsForMatching(
  client: SupabaseClient,
  prefs: SubscriberPreferences,
  configOverrides?: Partial<MatchConfig> | null,
  options: FetchJobRecordsForMatchingOptions = {},
): Promise<JobRecord[]> {
  if (prefs.subscriptionTierProductKeys.length === 0) {
    return []
  }

  const cfg = mergeConfig(configOverrides ?? null)
  const pageSize = options.pageSize ?? 1000
  const nowMs = Date.now()
  const rows: JobHopperLiveRow[] = []
  let offset = 0

  while (true) {
    const remaining = options.maxJobs != null ? options.maxJobs - rows.length : null
    if (remaining !== null && remaining <= 0) {
      break
    }

    const effectivePageSize =
      remaining !== null && remaining < pageSize ? remaining : pageSize

    const baseQuery = client
      .from('job_hopper_live')
      .select(JOB_HOPPER_LIVE_MATCH_SELECT)
      .order('created_at', { ascending: false })

    const filteredQuery = applyJobMatchingHardFiltersToQuery(baseQuery, prefs, cfg, nowMs)

    const { data: page, error } = await filteredQuery.range(
      offset,
      offset + effectivePageSize - 1,
    )

    if (error) {
      throw new Error(error.message)
    }

    if (!page || page.length === 0) {
      break
    }

    rows.push(...(page as JobHopperLiveRow[]))

    if (page.length < effectivePageSize) {
      break
    }

    offset += effectivePageSize
  }

  return rows.map(mapJobHopperLiveRowToRecord)
}
