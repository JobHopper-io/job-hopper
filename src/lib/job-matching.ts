import { supabase } from '@/lib/supabase'

// TEMPORARY TEST HELPER – DO NOT SHIP TO PRODUCTION
// This helper exists only to support the temporary match-jobs debug view.

export interface RankedJob {
  id: number
  title: string | null
  companyName: string | null
  location: string | null
  description: string | null
  jobHighlights: string | null
  applyLink: string | null
  createdAt: string
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

export interface MatchJobsDebugPayload {
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

export interface MatchJobsResponse {
  profile_id: string
  total: number
  jobs: RankedJob[]
  debug?: MatchJobsDebugPayload
}

export const jobMatchingAPI = {
  // TEMPORARY TEST METHOD – DO NOT SHIP TO PRODUCTION
  async getMatches(): Promise<{
    data: MatchJobsResponse | null
    error: Error | null
  }> {
    const { data, error } = await supabase.functions.invoke<MatchJobsResponse>(
      'match-jobs',
      {},
    )

    if (error) {
      return { data: null, error: new Error(error.message) }
    }

    return { data: data ?? null, error: null }
  },
}

