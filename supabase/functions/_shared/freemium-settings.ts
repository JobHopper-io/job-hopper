import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

const FALLBACK_MAX_JOB_SEARCHES = 3
const FALLBACK_MAX_RESUME_ADVICE = 3
const FALLBACK_MAX_PREMIUM_INSIGHTS = 3
const FALLBACK_CORE_DAILY_RESUME_ADVICE = 5
const FALLBACK_PREMIUM_DAILY_RESUME_ADVICE = 20
const FALLBACK_PREMIUM_DAILY_INSIGHTS = 20

export interface FreemiumSettingsRow {
  max_job_searches: number
  max_resume_advice: number
  max_premium_insights: number
  /** Per-UTC-day resume-advice cap for Core-tier subscribers. */
  core_daily_resume_advice: number
  /** Per-UTC-day resume-advice cap for Premium-tier subscribers. */
  premium_daily_resume_advice: number
  /** Per-UTC-day Premium Insights cap for the unlimited path (Premium tier + add-on). */
  premium_daily_insights: number
}

export async function getFreemiumSettings(
  client: SupabaseClient,
): Promise<FreemiumSettingsRow> {
  const { data, error } = await client
    .from('freemium_settings')
    .select(
      'max_job_searches, max_resume_advice, max_premium_insights, core_daily_resume_advice, premium_daily_resume_advice, premium_daily_insights',
    )
    .eq('id', 1)
    .maybeSingle()

  if (error || !data) {
    return {
      max_job_searches: FALLBACK_MAX_JOB_SEARCHES,
      max_resume_advice: FALLBACK_MAX_RESUME_ADVICE,
      max_premium_insights: FALLBACK_MAX_PREMIUM_INSIGHTS,
      core_daily_resume_advice: FALLBACK_CORE_DAILY_RESUME_ADVICE,
      premium_daily_resume_advice: FALLBACK_PREMIUM_DAILY_RESUME_ADVICE,
      premium_daily_insights: FALLBACK_PREMIUM_DAILY_INSIGHTS,
    }
  }

  return {
    max_job_searches: typeof data.max_job_searches === 'number' ? data.max_job_searches : FALLBACK_MAX_JOB_SEARCHES,
    max_resume_advice: typeof data.max_resume_advice === 'number' ? data.max_resume_advice : FALLBACK_MAX_RESUME_ADVICE,
    max_premium_insights:
      typeof data.max_premium_insights === 'number' ? data.max_premium_insights : FALLBACK_MAX_PREMIUM_INSIGHTS,
    core_daily_resume_advice:
      typeof data.core_daily_resume_advice === 'number'
        ? data.core_daily_resume_advice
        : FALLBACK_CORE_DAILY_RESUME_ADVICE,
    premium_daily_resume_advice:
      typeof data.premium_daily_resume_advice === 'number'
        ? data.premium_daily_resume_advice
        : FALLBACK_PREMIUM_DAILY_RESUME_ADVICE,
    premium_daily_insights:
      typeof data.premium_daily_insights === 'number'
        ? data.premium_daily_insights
        : FALLBACK_PREMIUM_DAILY_INSIGHTS,
  }
}
