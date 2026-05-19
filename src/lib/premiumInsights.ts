import { supabase } from '@/lib/supabase'
import type { JobContact } from '@/types/database'

export type PremiumInsightsSuccess = {
  status: 'complete'
  contacts: JobContact[]
  company_summary: unknown | null
}

type PremiumInsightsFnResponse = PremiumInsightsSuccess & { error?: string }

export const premiumInsightsAPI = {
  /**
   * Runs the premium-insights edge function for a job match (sync; may take several seconds).
   */
  async runForJobMatch(
    jobMatchId: string,
  ): Promise<{ data: PremiumInsightsSuccess | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<PremiumInsightsFnResponse>(
      'premium-insights',
      { body: { job_match_id: jobMatchId } },
    )

    if (error) {
      return { data: null, error: new Error(error.message) }
    }
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      return { data: null, error: new Error(String(data.error)) }
    }
    if (
      data &&
      data.status === 'complete' &&
      Array.isArray(data.contacts)
    ) {
      return {
        data: {
          status: 'complete',
          contacts: data.contacts as JobContact[],
          company_summary:
            'company_summary' in data ? (data as PremiumInsightsSuccess).company_summary : null,
        },
        error: null,
      }
    }
    return { data: null, error: new Error('Unexpected response from premium insights') }
  },
}
