import { supabase } from '@/lib/supabase'
import { parseFunctionsInvokeError } from '@/lib/parse-functions-invoke-error'

// Backed by the admin-prospects edge function (prospects + prospect_evidence are
// service-role only). Emails arrive masked; the full address never reaches the browser.

export const PROSPECT_SEGMENTS = [
  'active_job_seeker',
  'recent_graduate',
  'remote_seeker',
  'career_changer',
  'laid_off',
  'experienced_professional',
] as const
export const PROSPECT_CAREER_LEVELS = ['entry_mid', 'senior_management', 'director_vp_c_level'] as const

export type ProspectReviewStatus = 'pending' | 'approved' | 'rejected'
export type ProspectReviewAction = 'approve' | 'reject' | 'do_not_contact'
export type ProspectCareerLevel = (typeof PROSPECT_CAREER_LEVELS)[number]

export interface AdminProspectRow {
  id: string
  source: string
  country: string | null
  segments: string[] | null
  needs_sponsorship: boolean | null
  intent_score: number | null
  intent_reason: string | null
  target_job_title: string | null
  years_of_experience: number | null
  career_level: ProspectCareerLevel | null
  review_status: ProspectReviewStatus
  reviewed_at: string | null
  do_not_contact: boolean
  email_masked: string | null
  has_email: boolean
  evidence: { url: string; snippet: string | null; found_at: string } | null
  ineligible_reason: string | null
}

export interface ProspectReviewStats {
  pending: number
  approved: number
  rejected: number
  reviewed_today: number
}

export interface ListProspectsParams {
  reviewStatus?: ProspectReviewStatus | ''
  segment?: string
  minScore?: number | null
  hasEmail?: boolean | null
  limit?: number
  offset?: number
}

export const adminProspectsAPI = {
  async list(
    params: ListProspectsParams,
  ): Promise<{ data: { prospects: AdminProspectRow[]; total: number; stats: ProspectReviewStats } | null; error: Error | null }> {
    const qs = new URLSearchParams()
    if (params.reviewStatus) qs.set('review_status', params.reviewStatus)
    if (params.segment) qs.set('segment', params.segment)
    if (params.minScore != null) qs.set('min_score', String(params.minScore))
    if (params.hasEmail != null) qs.set('has_email', String(params.hasEmail))
    qs.set('limit', String(params.limit ?? 50))
    qs.set('offset', String(params.offset ?? 0))
    const { data, error } = await supabase.functions.invoke(`admin-prospects?${qs}`, { method: 'GET' })
    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    return { data: data as { prospects: AdminProspectRow[]; total: number; stats: ProspectReviewStats }, error: null }
  },

  async review(
    prospectId: string,
    action: ProspectReviewAction,
    corrections: { targetJobTitle?: string; careerLevel?: ProspectCareerLevel } = {},
  ): Promise<{ data: AdminProspectRow | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke('admin-prospects', {
      method: 'POST',
      body: { prospectId, action, ...corrections },
    })
    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    return { data: (data as { prospect: AdminProspectRow }).prospect, error: null }
  },
}
