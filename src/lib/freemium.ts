import { supabase } from '@/lib/supabase'

export const FREEMIUM_BASE_PLAN_TIER_KEYS = [
  'entry_mid',
  'senior_management',
  'director_vp_c_level',
] as const

export type FreemiumBasePlanTierKey = (typeof FREEMIUM_BASE_PLAN_TIER_KEYS)[number]

export function isFreemiumBasePlanTierKey(value: string): value is FreemiumBasePlanTierKey {
  return (FREEMIUM_BASE_PLAN_TIER_KEYS as readonly string[]).includes(value)
}

export type FreemiumRunJobSearchResponse = {
  matchesCreated: number
  jobSearchesUsed: number
  jobSearchesRemaining: number
  maxJobSearches: number
}

function functionsErrorMessage(error: { message?: string }, data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    return (data as { error: string }).error
  }
  return error.message ?? 'Request failed'
}

export const freemiumAPI = {
  async completeOnboarding(selectedTierKey: string): Promise<{ error: Error | null }> {
    if (!isFreemiumBasePlanTierKey(selectedTierKey)) {
      return { error: new Error('Invalid tier') }
    }
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
      'complete-onboarding',
      { body: { selectedTierKey } },
    )
    if (error) {
      return { error: new Error(functionsErrorMessage(error, data)) }
    }
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      return { error: new Error(String(data.error)) }
    }
    return { error: null }
  },

  async runJobSearch(): Promise<{
    data: FreemiumRunJobSearchResponse | null
    error: Error | null
  }> {
    const { data, error } = await supabase.functions.invoke<FreemiumRunJobSearchResponse & { error?: string }>(
      'freemium-run-job-search',
      { body: {} },
    )
    if (error) {
      return { data: null, error: new Error(functionsErrorMessage(error, data)) }
    }
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return { data: null, error: new Error(data.error) }
    }
    if (!data || typeof data !== 'object' || typeof data.maxJobSearches !== 'number') {
      return { data: null, error: new Error('Unexpected response') }
    }
    return {
      data: {
        matchesCreated: data.matchesCreated,
        jobSearchesUsed: data.jobSearchesUsed,
        jobSearchesRemaining: data.jobSearchesRemaining,
        maxJobSearches: data.maxJobSearches,
      },
      error: null,
    }
  },
}
