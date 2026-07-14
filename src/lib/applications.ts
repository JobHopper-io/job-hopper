import { supabase } from '@/lib/supabase'
import { profileAPI } from '@/lib/profile'
import type { ApplicationStatus, JobApplication } from '@/types/database'

type AppRow = Pick<JobApplication, 'id' | 'match_id' | 'status' | 'applied_at' | 'updated_at'>
type JobMatchRow = { id: string; job_id: string | null }
type JobHopperRow = { id: string; job_title: string | null; company_name: string | null }

async function getCurrentProfileId(): Promise<string> {
  const { data, error } = await profileAPI.getCurrentUserProfile()
  if (error || !data) {
    throw new Error('Unable to load current profile')
  }
  return data.id
}

/** Joined row returned by the tracker list query. */
export interface TrackedApplicationRow {
  id: string
  matchId: string
  jobId: string
  title: string | null
  company: string | null
  status: ApplicationStatus
  appliedAt: string | null
  updatedAt: string
}

export const applicationsAPI = {
  /**
   * Upsert application status for a match. Creates a row if none exists,
   * updates the status + updated_at if it does. Core/Premium only.
   */
  async setStatus(
    matchId: string,
    status: ApplicationStatus,
  ): Promise<{ error: Error | null }> {
    const profileId = await getCurrentProfileId()

    const { error } = await supabase.from('job_applications').upsert(
      {
        profile_id: profileId,
        match_id: matchId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id, match_id' },
    )

    if (error) return { error }
    return { error: null }
  },

  /** Get all application rows for the current user, joined with job details. */
  async getAll(): Promise<{ data: TrackedApplicationRow[]; error: Error | null }> {
    const { data: apps, error } = await supabase
      .from('job_applications')
      .select('id, match_id, status, applied_at, updated_at')
      .order('updated_at', { ascending: false })

    if (error) return { data: [], error }
    if (!apps?.length) return { data: [], error: null }

    const appRows = apps as unknown as AppRow[]
    const matchIds = appRows.map((r) => r.match_id)

    const { data: matches, error: matchError } = await supabase
      .from('job_matches')
      .select('id, job_id')
      .in('id', matchIds)

    if (matchError) return { data: [], error: matchError }

    const jobIds = Array.from(
      new Set((matches ?? []).map((m) => m.job_id).filter(Boolean)),
    ) as string[]

    const { data: jobs, error: jobsError } = jobIds.length
      ? await supabase
          .from('job_hopper_live')
          .select('id, job_title, company_name')
          .in('id', jobIds)
      : { data: [], error: null }

    if (jobsError) return { data: [], error: jobsError }

    const jobById = new Map((jobs ?? []).map((j) => [j.id, j]))
    const matchById = new Map((matches ?? []).map((m) => [m.id, m]))

    const result: TrackedApplicationRow[] = appRows.map((a) => {
      const match = matchById.get(a.match_id) as JobMatchRow | undefined
      const job = match?.job_id
        ? (jobById.get(match.job_id) as JobHopperRow | undefined)
        : null
      return {
        id: a.id,
        matchId: a.match_id,
        jobId: match?.job_id ?? '',
        title: job?.job_title ?? null,
        company: job?.company_name ?? null,
        status: a.status,
        appliedAt: a.applied_at,
        updatedAt: a.updated_at,
      }
    })

    return { data: result, error: null }
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
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle()

    if (error) return { data: null, error }
    return { data: data as AppRow | null, error: null }
  },
}
