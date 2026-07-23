import { supabase } from '@/lib/supabase'
import { profileAPI } from '@/lib/profile'
import { getEffectiveSponsorshipLikelihood } from '@shared/infer-sponsorship-likelihood'
import { jobExceedsMaxAge, defaultConfig, type JobRecord } from '@shared/job-matching-algorithm'
import type {
  JobMatch,
  SavedJob,
  JobHopperLive,
  MatchedJob,
  MatchingStats,
  PayType,
  RoleCategory,
  JobContact,
  JobHiringContactsStatus,
  PremiumInsightsOrgChoice,
  RealSponsorshipTier,
  SponsorWatchSubscription,
} from '@/types/database'

/** Narrows the DB's `text` + check-constraint columns to the app's Low/Medium/High type. */
function asRealSponsorshipTier(value: string | null | undefined): RealSponsorshipTier | null {
  return value === 'Low' || value === 'Medium' || value === 'High' ? value : null
}

/** Real Sponsorship Score, keyed by employer domain (§3 decision 11). Looked up via
 * job_hopper_live.company_domain = employers.domain - see docs/sponsorship-data-engine.md D46-50
 * for why domain, not company name. Excludes employers.excluded_from_scoring=true (no row
 * fetched for them at all - not a degraded score) and employers with no score row yet.
 * `employerId` (added D51-55) is what Sponsor Watch subscribes/unsubscribes against - only
 * ever needed alongside a real score, since watching is only offered where the badge is
 * real-score-backed (same §3 decision 11 gate). */
type RealScoreByDomain = Map<
  string,
  {
    employerId: string
    score: RealSponsorshipTier
    confidence: RealSponsorshipTier | null
    rationale: string | null
  }
>

async function fetchRealScoresByDomain(domains: string[]): Promise<RealScoreByDomain> {
  const map: RealScoreByDomain = new Map()
  if (domains.length === 0) return map

  const { data, error } = await supabase
    .from('employers')
    .select('id, domain, excluded_from_scoring, employer_sponsorship_scores(score, confidence, rationale)')
    .in('domain', domains)
    .eq('excluded_from_scoring', false)

  if (error || !data) return map

  for (const row of data as unknown as {
    id: string
    domain: string | null
    employer_sponsorship_scores: { score: string | null; confidence: string | null; rationale: string | null } | null
  }[]) {
    const domain = row.domain
    const scoreRow = row.employer_sponsorship_scores
    const score = asRealSponsorshipTier(scoreRow?.score)
    if (!domain || !score) continue
    map.set(domain, {
      employerId: row.id,
      score,
      confidence: asRealSponsorshipTier(scoreRow?.confidence),
      rationale: scoreRow?.rationale ?? null,
    })
  }

  return map
}

/** Employer ids the current profile has an active Sponsor Watch subscription for. */
async function fetchWatchedEmployerIds(profileId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('sponsor_watch_subscriptions')
    .select('employer_id')
    .eq('profile_id', profileId)

  if (error || !data) return new Set()
  return new Set(data.map((row) => row.employer_id as string))
}

function parsePremiumInsightsOrgChoices(raw: unknown): PremiumInsightsOrgChoice[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: PremiumInsightsOrgChoice[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const o = item as Record<string, unknown>
    const apollo_organization_id =
      typeof o.apollo_organization_id === 'string' ? o.apollo_organization_id.trim() : ''
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const scoreRaw = o.score
    const score =
      typeof scoreRaw === 'number'
        ? scoreRaw
        : typeof scoreRaw === 'string'
          ? Number(scoreRaw)
          : NaN
    if (!apollo_organization_id || !name || Number.isNaN(score)) return null
    out.push({
      apollo_organization_id,
      name,
      primary_domain: typeof o.primary_domain === 'string' ? o.primary_domain : null,
      score,
    })
  }
  return out
}

export type { PayType, RoleCategory, MatchedJob, MatchingStats }

/** A Sponsor Watch subscription joined with its employer's identity + Real Score, for the
 * Premium Tools management view (list + unwatch). `subscriptionId` is the row to key on;
 * `employerId` is what `unwatchEmployer` takes. */
export type WatchedEmployer = {
  subscriptionId: string
  employerId: string
  name: string
  domain: string | null
  score: RealSponsorshipTier | null
  confidence: RealSponsorshipTier | null
  watchedSince: string
  /** Sponsor Watch's last automated check (sponsor-watch-check edge function) - null until the
   * first check has run for this employer. No per-event history exists (see D51-55): this is
   * only the most recent check's snapshot, not a full log. */
  lastCheckedAt: string | null
  lastCheckedScore: RealSponsorshipTier | null
  lastCheckedPositions: number | null
}

/** Columns selected from job_hopper_live for match list and detail (single source of truth) */
const JOB_HOPPER_LIVE_SELECT = `
  id,
  job_title,
  company_name,
  location,
  description,
  ai_job_briefing,
  apply_link,
  created_at,
  role_category,
  subscription_tier,
  schedules,
  employment_types,
  pay_min,
  pay_max,
  pay_type,
  employee_count,
  posted_date,
  is_remote,
  sponsorship_likelihood,
  company_domain
` as const

function parseJobContactsFromJson(raw: unknown): JobContact[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: JobContact[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.name !== 'string' || !o.name.trim()) continue
    out.push({
      name: o.name.trim(),
      title: typeof o.title === 'string' ? o.title : null,
      location: typeof o.location === 'string' ? o.location : null,
      note: typeof o.note === 'string' ? o.note : null,
      email: typeof o.email === 'string' && o.email.trim() ? o.email.trim() : null,
    })
  }
  return out.length ? out : undefined
}

/** Whole days between an ISO timestamp and now. Null on an unparseable/missing input. */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000))
}

function parseWhyFitBullets(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const bullets = raw.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
  return bullets.length > 0 ? bullets : null
}

function toMatchedJob(
  match: JobMatch,
  job: JobHopperLive | null,
  isSaved: boolean,
  realScoresByDomain: RealScoreByDomain,
  watchedEmployerIds: Set<string>,
): MatchedJob {
  const storedSponsorship = job?.sponsorship_likelihood ?? null
  const realScore = job?.company_domain ? realScoresByDomain.get(job.company_domain) ?? null : null
  const jobData = job
    ? {
        title: job.job_title ?? null,
        companyName: job.company_name ?? null,
        roleCategory: job.role_category ?? null,
        location: job.location ?? null,
        description: job.description ?? null,
        aiBriefing: job.ai_job_briefing ?? null,
        employeeCount: job.employee_count ?? null,
      }
    : null
  const effectiveSponsorship =
    jobData != null
      ? getEffectiveSponsorshipLikelihood(storedSponsorship ?? 'N/A', jobData)
      : null

  // Same posted_date-else-created_at source match-jobs uses at creation time
  // (docs/job-matching-rules.md gate #2) - re-checked here at read time only to surface a
  // note, not to re-gate or hide anything already matched.
  const ageSourceIso = job?.posted_date ?? job?.created_at ?? null
  const isStale = ageSourceIso
    ? jobExceedsMaxAge({ postedDate: ageSourceIso, createdAt: ageSourceIso } as JobRecord, defaultConfig)
    : false
  const daysSincePosted = daysSince(ageSourceIso)
  const isRecentlyPosted = daysSincePosted != null && daysSincePosted <= 7

  return {
    matchId: match.id,
    jobId: (match.job_id as string) ?? '',
    score: match.score ?? null,
    createdAt: match.created_at ?? '',
    isSaved,
    title: job?.job_title ?? null,
    company: job?.company_name ?? null,
    location: job?.location ?? null,
    description: job?.description ?? null,
    aiBriefing: job?.ai_job_briefing ?? null,
    applyLink: job?.apply_link ?? null,
    roleCategory: job?.role_category ?? null,
    subscriptionTier: job?.subscription_tier ?? null,
    subscriptionTierDisplayName: null,
    schedules: job?.schedules ?? null,
    employmentTypes: job?.employment_types ?? null,
    payMin: job?.pay_min ?? null,
    payMax: job?.pay_max ?? null,
    payType: job?.pay_type ?? null,
    employeeCount: job?.employee_count ?? null,
    postedDate: job?.posted_date ?? null,
    isRemote: job?.is_remote ?? null,
    sponsorshipLikelihood: effectiveSponsorship ?? storedSponsorship,
    sponsorshipRealScore: realScore?.score ?? null,
    sponsorshipRealConfidence: realScore?.confidence ?? null,
    sponsorshipRealRationale: realScore?.rationale ?? null,
    sponsorshipEmployerId: realScore?.employerId ?? null,
    sponsorshipWatched: realScore?.employerId ? watchedEmployerIds.has(realScore.employerId) : false,
    isStale,
    daysSincePosted,
    isRecentlyPosted,
    whyFitBullets: parseWhyFitBullets(match.why_fit_bullets),
    whyFitGeneratedAt: match.why_fit_generated_at ?? null,
  }
}

// API helper, should not be exported
async function getCurrentProfileId(): Promise<string> {
  const { data, error } = await profileAPI.getCurrentUserProfile()
  if (error || !data) {
    throw new Error('Unable to load current profile')
  }
  return data.id
}

export const jobsAPI = {
  async getJobMatches(
  ): Promise<{ data: MatchedJob[]; error: Error | null }> {
    const query = supabase
      .from('job_matches')
      .select('id, profile_id, job_id, score, created_at, why_fit_bullets, why_fit_generated_at')
      .order('created_at', { ascending: false })

    const { data: matchesRaw, error } = await query
    if (error) {
      return { data: [], error }
    }

    const matches = (matchesRaw ?? []) as JobMatch[]

    if (!matches.length) {
      return { data: [], error: null }
    }

    const jobIds = Array.from(
      new Set(
        matches
          .map((m) => m.job_id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    )

    const matchIds = matches.map((m) => m.id)

    const [{ data: jobsRaw, error: jobsError }, { data: savedRowsRaw, error: savedError }, { data: hiringRaw, error: hiringError }] =
      await Promise.all([
        jobIds.length
          ? supabase.from('job_hopper_live').select(JOB_HOPPER_LIVE_SELECT).in('id', jobIds)
          : supabase.from('job_hopper_live').select('id').limit(0),
        supabase
          .from('saved_jobs')
          .select('match_id')
          .in('match_id', matchIds),
        supabase
          .from('job_hiring_contacts')
          .select('job_match_id, status, contacts, error_code, org_disambiguation_options')
          .in('job_match_id', matchIds),
      ])

    if (jobsError) {
      return { data: [], error: jobsError }
    }

    if (savedError) {
      return { data: [], error: savedError }
    }

    if (hiringError) {
      return { data: [], error: hiringError }
    }

    const jobs = (jobsRaw ?? []) as JobHopperLive[]
    const savedRows = (savedRowsRaw ?? []) as SavedJob[]

    const domains = Array.from(
      new Set(
        jobs
          .map((j) => j.company_domain)
          .filter((d): d is string => typeof d === 'string' && d.length > 0),
      ),
    )
    const realScoresByDomain = await fetchRealScoresByDomain(domains)
    const watchedEmployerIds = await getCurrentProfileId()
      .then(fetchWatchedEmployerIds)
      .catch(() => new Set<string>())

    const hiringByMatchId = new Map<
      string,
      {
        status: JobHiringContactsStatus
        contacts: unknown
        error_code: string | null
        org_disambiguation_options: unknown
      }
    >()
    for (const row of hiringRaw ?? []) {
      const mid = row.job_match_id as string | undefined
      const st = row.status as JobHiringContactsStatus | undefined
      if (!mid || !st) continue
      hiringByMatchId.set(mid, {
        status: st,
        contacts: row.contacts,
        error_code: (row.error_code as string | null) ?? null,
        org_disambiguation_options: (row as { org_disambiguation_options?: unknown })
          .org_disambiguation_options,
      })
    }

    const tierKeys = Array.from(
      new Set(
        jobs
          .map((j) => j.subscription_tier)
          .filter((key): key is string => typeof key === 'string' && key.length > 0),
      ),
    )

    let tierNameByKey = new Map<string, string>()
    if (tierKeys.length > 0) {
      const { data: productsRaw, error: productsError } = await supabase
        .from('products')
        .select('key, display_name')
        .in('key', tierKeys)

      if (productsError) {
        return { data: [], error: productsError }
      }

      tierNameByKey = new Map(
        (productsRaw ?? []).map((p: { key: string; display_name: string }) => [
          p.key,
          p.display_name,
        ]),
      )
    }

    const jobById = new Map<string, JobHopperLive>()
    for (const row of jobs) {
      if (typeof row.id === 'string') {
        jobById.set(row.id, row)
      }
    }

    const savedMatchIds = new Set<string>(
      savedRows.map((row) => row.match_id).filter((id): id is string => !!id),
    )

    const result: MatchedJob[] = matches.map((match) => {
      const job = match.job_id ? jobById.get(match.job_id) ?? null : null
      const base = toMatchedJob(match, job, savedMatchIds.has(match.id), realScoresByDomain, watchedEmployerIds)
      const tierName =
        base.subscriptionTier != null
          ? tierNameByKey.get(base.subscriptionTier) ?? null
          : null
      const hiring = hiringByMatchId.get(match.id)
      const contacts =
        hiring?.status === 'complete' ? parseJobContactsFromJson(hiring.contacts) : undefined
      return {
        ...base,
        subscriptionTierDisplayName: tierName,
        premiumInsightsStatus: hiring?.status ?? null,
        premiumInsightsErrorCode: hiring?.error_code ?? null,
        premiumInsightsOrgChoices: parsePremiumInsightsOrgChoices(hiring?.org_disambiguation_options),
        contacts,
      }
    })

    return { data: result, error: null }
  },

  async getJobMatchByJobId(
    jobId: string,
  ): Promise<{ data: MatchedJob | null; error: Error | null }> {
    const { data: matchRaw, error: matchError } = await supabase
      .from('job_matches')
      .select('id, job_id, score, created_at, why_fit_bullets, why_fit_generated_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (matchError) {
      const isNoRowsError =
        typeof matchError === 'object' &&
        matchError !== null &&
        'code' in matchError &&
        (matchError as { code?: string }).code === 'PGRST116'

      if (isNoRowsError) {
        // No rows found
        return { data: null, error: null }
      }
      return { data: null, error: matchError }
    }

    const match = matchRaw as JobMatch

    const [{ data: job, error: jobError }, { data: savedRow, error: savedError }, { data: hiringRow, error: hiringError }] =
      await Promise.all([
        supabase
          .from('job_hopper_live')
          .select(JOB_HOPPER_LIVE_SELECT)
          .eq('id', match.job_id)
          .maybeSingle(),
        supabase
          .from('saved_jobs')
          .select('id, match_id')
          .eq('match_id', match.id)
          .maybeSingle(),
        supabase
          .from('job_hiring_contacts')
          .select('status, contacts, error_code, org_disambiguation_options')
          .eq('job_match_id', match.id)
          .maybeSingle(),
      ])

    if (jobError) {
      return { data: null, error: jobError }
    }

    if (!job) {
      return { data: null, error: new Error('Job not found for matched job') }
    }

    if (savedError) {
      const isNoRowsError =
        typeof savedError === 'object' &&
        savedError !== null &&
        'code' in savedError &&
        (savedError as { code?: string }).code === 'PGRST116'

      if (!isNoRowsError) {
        return { data: null, error: savedError }
      }
    }

    if (hiringError) {
      return { data: null, error: hiringError }
    }

    let subscriptionTierDisplayName: string | null = null
    if (job.subscription_tier) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('key, display_name')
        .eq('key', job.subscription_tier)
        .maybeSingle()

      if (productError) {
        const isNoRowsError =
          typeof productError === 'object' &&
          productError !== null &&
          'code' in productError &&
          (productError as { code?: string }).code === 'PGRST116'

        if (!isNoRowsError) {
          return { data: null, error: productError }
        }
      }

      subscriptionTierDisplayName =
        (product as { display_name?: string } | null)?.display_name ?? null
    }

    const jobDomain = (job as JobHopperLive).company_domain
    const realScoresByDomain = jobDomain ? await fetchRealScoresByDomain([jobDomain]) : new Map()
    const watchedEmployerIds = await getCurrentProfileId()
      .then(fetchWatchedEmployerIds)
      .catch(() => new Set<string>())
    const base = toMatchedJob(match, job as JobHopperLive, !!savedRow, realScoresByDomain, watchedEmployerIds)

    const hiringStatus = hiringRow?.status as JobHiringContactsStatus | undefined
    const contacts =
      hiringStatus === 'complete' ? parseJobContactsFromJson(hiringRow?.contacts) : undefined
    const orgRaw = (hiringRow as { org_disambiguation_options?: unknown } | null)
      ?.org_disambiguation_options

    return {
      data: {
        ...base,
        subscriptionTierDisplayName,
        premiumInsightsStatus: hiringStatus ?? null,
        premiumInsightsErrorCode: (hiringRow?.error_code as string | null) ?? null,
        premiumInsightsOrgChoices: parsePremiumInsightsOrgChoices(orgRaw),
        contacts,
      },
      error: null,
    }
  },

  async getMatchingStats(): Promise<{ data: MatchingStats; error: Error | null }> {
    let profileId: string
    try {
      profileId = await getCurrentProfileId()
    } catch {
      return {
        data: { thisWeek: 0, totalDelivered: 0, avgMatchScore: null },
        error: new Error('Unable to load current profile'),
      }
    }

    const { data, error } = await supabase
      .from('job_matches')
      .select('score, created_at')
      .eq('profile_id', profileId)

    if (error || !data) {
      return {
        data: { thisWeek: 0, totalDelivered: 0, avgMatchScore: null },
        error: error ?? new Error('Failed to load matching statistics'),
      }
    }

    const now = new Date()
    const day = now.getDay()
    const diffToMonday = (day + 6) % 7
    const weekStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - diffToMonday,
    )

    let totalDelivered = 0
    let thisWeek = 0
    let sumScore = 0
    let scoreCount = 0

    for (const row of data) {
      totalDelivered += 1
      const createdAtStr = row.created_at as string | null
      if (createdAtStr) {
        const createdDate = new Date(createdAtStr)
        if (createdDate >= weekStart) {
          thisWeek += 1
        }
      }
      const score = row.score as number | null
      if (score != null) {
        sumScore += score
        scoreCount += 1
      }
    }

    const stats: MatchingStats = {
      thisWeek,
      totalDelivered,
      avgMatchScore: scoreCount > 0 ? Math.round((sumScore / scoreCount) * 100) / 100 : null,
    }

    return { data: stats, error: null }
  },

  async saveJob(matchId: string): Promise<{ error: Error | null }> {
    const profileId = await getCurrentProfileId()

    const { error } = await supabase.from('saved_jobs').insert({
      profile_id: profileId,
      match_id: matchId,
    } satisfies Partial<SavedJob>)

    if (error) {
      return { error }
    }

    return { error: null }
  },

  async unsaveJob(matchId: string): Promise<{ error: Error | null }> {
    const { error } = await supabase
      .from('saved_jobs')
      .delete()
      .eq('match_id', matchId)

    if (error) {
      return { error }
    }

    return { error: null }
  },

  /** Sponsor Watch (Premium, D51-55): subscribe to quarterly filing-volume alerts for the
   * job's resolved employer. `employerId` is `employers.id`, brand-level (§3 decision 5) -
   * watching "Goldman Sachs" covers all of its filers. Premium gating happens in the UI layer
   * (same condition as the real-score badge), not here - RLS/grants are the DB-level backstop. */
  async watchEmployer(employerId: string): Promise<{ error: Error | null }> {
    const profileId = await getCurrentProfileId()

    const { error } = await supabase.from('sponsor_watch_subscriptions').insert({
      profile_id: profileId,
      employer_id: employerId,
    } satisfies Partial<SponsorWatchSubscription>)

    if (error) {
      return { error }
    }

    return { error: null }
  },

  async unwatchEmployer(employerId: string): Promise<{ error: Error | null }> {
    const profileId = await getCurrentProfileId()

    const { error } = await supabase
      .from('sponsor_watch_subscriptions')
      .delete()
      .eq('profile_id', profileId)
      .eq('employer_id', employerId)

    if (error) {
      return { error }
    }

    return { error: null }
  },

  /** Premium Tools management view: every employer the current profile is watching, with
   * enough identity + score data to render a manage/unwatch list. */
  async listWatchedEmployers(): Promise<{ data: WatchedEmployer[]; error: Error | null }> {
    const profileId = await getCurrentProfileId()

    const { data, error } = await supabase
      .from('sponsor_watch_subscriptions')
      .select(
        'id, employer_id, created_at, employers(canonical_name, domain, employer_sponsorship_scores(score, confidence, watch_last_checked_at, watch_last_checked_score, watch_last_checked_positions))',
      )
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })

    if (error || !data) {
      return { data: [], error }
    }

    const rows = data as unknown as {
      id: string
      employer_id: string
      created_at: string
      employers: {
        canonical_name: string
        domain: string | null
        employer_sponsorship_scores: {
          score: string | null
          confidence: string | null
          watch_last_checked_at: string | null
          watch_last_checked_score: string | null
          watch_last_checked_positions: number | null
        } | null
      } | null
    }[]

    return {
      data: rows
        .filter((row) => row.employers != null)
        .map((row) => {
          const scores = row.employers!.employer_sponsorship_scores
          return {
            subscriptionId: row.id,
            employerId: row.employer_id,
            name: row.employers!.canonical_name,
            domain: row.employers!.domain,
            score: asRealSponsorshipTier(scores?.score),
            confidence: asRealSponsorshipTier(scores?.confidence),
            watchedSince: row.created_at,
            lastCheckedAt: scores?.watch_last_checked_at ?? null,
            lastCheckedScore: asRealSponsorshipTier(scores?.watch_last_checked_score),
            lastCheckedPositions: scores?.watch_last_checked_positions ?? null,
          }
        }),
      error: null,
    }
  },

  /**
   * Subscriber (Core/Premium) manual job search. Triggers an on-demand matching pass via
   * the `run-job-search` edge function so subscribers aren't stuck waiting for the next
   * automated digest. No per-search cap (unlike the freemium path).
   */
  /**
   * LLM-generated "why this is a fit" bullets for a single job match (JobDetail). Cached
   * server-side on job_matches after first generation - safe to call on every page load,
   * a cache hit costs one DB read and no LLM call.
   */
  async generateWhyFit(matchId: string): Promise<{
    data: { bullets: string[]; generatedAt: string | null } | null
    error: Error | null
  }> {
    const { data, error } = await supabase.functions.invoke<{
      bullets?: string[]
      generatedAt?: string | null
      error?: string
    }>('generate-why-fit', { body: { job_match_id: matchId } })

    if (error) {
      return { data: null, error: new Error(error.message) }
    }
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      return { data: null, error: new Error(String(data.error)) }
    }
    if (!data || !Array.isArray(data.bullets) || data.bullets.length === 0) {
      return { data: null, error: new Error('Unexpected response') }
    }
    return { data: { bullets: data.bullets, generatedAt: data.generatedAt ?? null }, error: null }
  },

  async runManualJobSearch(): Promise<{
    data: { matchesCreated: number } | null
    error: Error | null
  }> {
    const { data, error } = await supabase.functions.invoke<{
      matchesCreated?: number
      error?: string
    }>('run-job-search', { body: {} })

    if (error) {
      return { data: null, error: new Error(error.message) }
    }
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return { data: null, error: new Error(data.error) }
    }
    if (!data || typeof data.matchesCreated !== 'number') {
      return { data: null, error: new Error('Unexpected response') }
    }
    return { data: { matchesCreated: data.matchesCreated }, error: null }
  },
}

