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

export interface MatchJobsResponse {
  profile_id: string
  total: number
  jobs: RankedJob[]
}

export const jobMatchingAPI = {
  // TEMPORARY TEST METHOD – DO NOT SHIP TO PRODUCTION
  async getMatches(limit?: number): Promise<{
    data: MatchJobsResponse | null
    error: Error | null
  }> {
    const functionName =
      typeof limit === 'number' && Number.isFinite(limit)
        ? `match-jobs?limit=${Math.max(1, Math.min(500, Math.floor(limit)))}`
        : 'match-jobs'

    const { data, error } = await supabase.functions.invoke<MatchJobsResponse>(
      functionName,
      {},
    )

    if (error) {
      return { data: null, error: new Error(error.message) }
    }

    return { data: data ?? null, error: null }
  },
}

