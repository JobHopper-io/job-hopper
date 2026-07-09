import { supabase } from '@/lib/supabase'
import { profileAPI } from '@/lib/profile'
import { getEffectiveSponsorshipLikelihood } from '@shared/infer-sponsorship-likelihood'
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
} from '@/types/database'

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
  sponsorship_likelihood
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

function toMatchedJob(
  match: JobMatch,
  job: JobHopperLive | null,
  isSaved: boolean,
): MatchedJob {
  const storedSponsorship = job?.sponsorship_likelihood ?? null
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
      .select('id, profile_id, job_id, score, created_at')
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
      const base = toMatchedJob(match, job, savedMatchIds.has(match.id))
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
      .select('id, job_id, score, created_at')
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

    const base = toMatchedJob(match, job as JobHopperLive, !!savedRow)

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

  /**
   * Subscriber (Core/Premium) manual job search. Triggers an on-demand matching pass via
   * the `run-job-search` edge function so subscribers aren't stuck waiting for the next
   * automated digest. No per-search cap (unlike the freemium path).
   */
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

