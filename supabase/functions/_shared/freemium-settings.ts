import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

const FALLBACK_MAX_JOB_SEARCHES = 3
const FALLBACK_MAX_RESUME_ADVICE = 3

export interface FreemiumSettingsRow {
  max_job_searches: number
  max_resume_advice: number
}

export async function getFreemiumSettings(
  client: SupabaseClient,
): Promise<FreemiumSettingsRow> {
  const { data, error } = await client
    .from('freemium_settings')
    .select('max_job_searches, max_resume_advice')
    .eq('id', 1)
    .maybeSingle()

  if (error || !data) {
    return {
      max_job_searches: FALLBACK_MAX_JOB_SEARCHES,
      max_resume_advice: FALLBACK_MAX_RESUME_ADVICE,
    }
  }

  return {
    max_job_searches: typeof data.max_job_searches === 'number' ? data.max_job_searches : FALLBACK_MAX_JOB_SEARCHES,
    max_resume_advice: typeof data.max_resume_advice === 'number' ? data.max_resume_advice : FALLBACK_MAX_RESUME_ADVICE,
  }
}
