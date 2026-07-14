import { supabase } from '@/lib/supabase'
import { profileAPI } from '@/lib/profile'
import type { ApplicationStatus, JobApplication, PayType } from '@/types/database'

const APP_COLUMNS =
  'id, match_id, status, applied_at, updated_at, job_id, job_title, company_name, apply_link, location, pay_min, pay_max, pay_type'

type AppRow = Pick<
  JobApplication,
  | 'id'
  | 'match_id'
  | 'status'
  | 'applied_at'
  | 'updated_at'
  | 'job_id'
  | 'job_title'
  | 'company_name'
  | 'apply_link'
  | 'location'
  | 'pay_min'
  | 'pay_max'
  | 'pay_type'
>

/** A point-in-time snapshot of the job details captured when tracking starts/updates,
 * so the tracker stays accurate even if the listing is later pruned from job_hopper_live. */
export interface JobSnapshot {
  jobId: string | null
  title: string | null
  company: string | null
  applyLink: string | null
  location: string | null
  payMin: number | null
  payMax: number | null
  payType: PayType | null
}

async function getCurrentProfileId(): Promise<string> {
  const { data, error } = await profileAPI.getCurrentUserProfile()
  if (error || !data) {
    throw new Error('Unable to load current profile')
  }
  return data.id
}

/** Row returned by the tracker list query, sourced entirely from the job_applications snapshot. */
export interface TrackedApplicationRow {
  id: string
  matchId: string
  jobId: string | null
  title: string | null
  company: string | null
  applyLink: string | null
  location: string | null
  payMin: number | null
  payMax: number | null
  payType: PayType | null
  status: ApplicationStatus
  appliedAt: string | null
  updatedAt: string
}

function toTrackedApplicationRow(a: AppRow): TrackedApplicationRow {
  return {
    id: a.id,
    matchId: a.match_id,
    jobId: a.job_id,
    title: a.job_title,
    company: a.company_name,
    applyLink: a.apply_link,
    location: a.location,
    payMin: a.pay_min,
    payMax: a.pay_max,
    payType: a.pay_type,
    status: a.status,
    appliedAt: a.applied_at,
    updatedAt: a.updated_at,
  }
}

export const applicationsAPI = {
  /**
   * Upsert application status for a match, snapshotting the job's display details
   * (title, company, apply link, location, pay) at the same time. Creates a row if
   * none exists, updates status + snapshot + updated_at if it does. Core/Premium only.
   */
  async setStatus(
    matchId: string,
    status: ApplicationStatus,
    job: JobSnapshot,
  ): Promise<{ error: Error | null }> {
    const profileId = await getCurrentProfileId()

    const { error } = await supabase.from('job_applications').upsert(
      {
        profile_id: profileId,
        match_id: matchId,
        status,
        job_id: job.jobId,
        job_title: job.title,
        company_name: job.company,
        apply_link: job.applyLink,
        location: job.location,
        pay_min: job.payMin,
        pay_max: job.payMax,
        pay_type: job.payType,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id, match_id' },
    )

    if (error) return { error }
    return { error: null }
  },

  /** Get all application rows for the current user, from the job_applications snapshot. */
  async getAll(): Promise<{ data: TrackedApplicationRow[]; error: Error | null }> {
    const { data: apps, error } = await supabase
      .from('job_applications')
      .select(APP_COLUMNS)
      .order('updated_at', { ascending: false })

    if (error) return { data: [], error }
    if (!apps?.length) return { data: [], error: null }

    const appRows = apps as unknown as AppRow[]
    return { data: appRows.map(toTrackedApplicationRow), error: null }
  },

  /** Remove the application tracking row (reset to untracked). */
  async remove(matchId: string): Promise<{ error: Error | null }> {
    const { error } = await supabase
      .from('job_applications')
      .delete()
      .eq('match_id', matchId)

    if (error) return { error }
    return { error: null }
  },

  /** Get the application status for a single match (null if untracked). */
  async getForMatch(
    matchId: string,
  ): Promise<{ data: AppRow | null; error: Error | null }> {
    const { data, error } = await supabase
      .from('job_applications')
      .select(APP_COLUMNS)
      .eq('match_id', matchId)
      .maybeSingle()

    if (error) return { data: null, error }
    return { data: data as unknown as AppRow | null, error: null }
  },
}
