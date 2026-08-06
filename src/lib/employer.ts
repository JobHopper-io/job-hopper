import { supabase } from '@/lib/supabase'
import { parseFunctionsInvokeError } from '@/lib/parse-functions-invoke-error'
import type { EmployerAccount, EmployerRevealRequestWithDraft, PayType } from '@/types/database'

export type RevealRequestDetails = {
  roleTitle: string
  payMin?: number | null
  payMax?: number | null
  payType?: PayType | null
}

export type CandidateSearchFilters = {
  roleCategory?: string
  careerLevel?: string
  location?: string
}

/** Anonymized search result - name, contact info, and current_employer never leave the
 * edge function (see supabase/functions/employer-candidate-search). */
export type CandidateSearchResult = {
  id: string
  current_job_title: string | null
  career_level: string | null
  years_of_experience: number | null
  target_role_categories: string[] | null
  preferred_locations: string[] | null
}

export const employerAPI = {
  /** Employer sign-up: distinct from authAPI.signUp - handle_new_user() branches on
   * account_type to create an employer_accounts row instead of a profiles row. */
  async signUp(email: string, password: string, companyName: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/employer/register`,
        data: {
          account_type: 'employer',
          company_name: companyName,
        },
      },
    })

    if (error) {
      console.error('Employer auth signUp error:', error.message, error)
    }

    return { data, error }
  },

  async getCurrentEmployerAccount(): Promise<{ data: EmployerAccount | null; error: Error | null }> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (!user || authError) {
      return { data: null, error: new Error('Not authenticated') }
    }

    const { data, error } = await supabase
      .from('employer_accounts')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle<EmployerAccount>()

    return { data: data ?? null, error }
  },

  async searchCandidates(
    filters: CandidateSearchFilters,
  ): Promise<{ data: CandidateSearchResult[] | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{
      candidates?: CandidateSearchResult[]
      error?: string
    }>('employer-candidate-search', {
      body: {
        role_category: filters.roleCategory || undefined,
        career_level: filters.careerLevel || undefined,
        location: filters.location || undefined,
      },
    })

    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    if (data?.error) return { data: null, error: new Error(data.error) }
    return { data: data?.candidates ?? [], error: null }
  },

  /** Send a reveal request for a specific candidate found via searchCandidates. Requires the
   * actual role and pay range on offer - the seeker shouldn't have to approve blind. */
  async sendRevealRequest(
    candidateProfileId: string,
    details: RevealRequestDetails,
  ): Promise<{ error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
      'employer-request-reveal',
      {
        body: {
          candidate_profile_id: candidateProfileId,
          role_title: details.roleTitle,
          pay_min: details.payMin ?? undefined,
          pay_max: details.payMax ?? undefined,
          pay_type: details.payType ?? undefined,
        },
      },
    )

    if (error) return { error: new Error(await parseFunctionsInvokeError(error)) }
    if (data?.error) return { error: new Error(data.error) }
    return { error: null }
  },

  /** Requests this employer has sent, newest first - RLS scopes rows to their own employer_account_id. */
  async getSentRevealRequests(): Promise<{ data: EmployerRevealRequestWithDraft[] | null; error: Error | null }> {
    const { data, error } = await supabase
      .from('employer_reveal_requests')
      .select('*')
      .order('created_at', { ascending: false })

    // Cast: outreach_draft_* columns exist in the DB (migration
    // 20260806120000_employer_reveal_requests_outreach_draft.sql) but aren't in the generated
    // Row type yet - see EmployerRevealRequestWithDraft.
    return { data: (data as EmployerRevealRequestWithDraft[] | null) ?? null, error }
  },

  /** Withdraw a still-pending reveal request. Once approved or declined it's final. */
  async cancelRevealRequest(requestId: string): Promise<{ error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
      'employer-cancel-reveal-request',
      { body: { request_id: requestId } },
    )

    if (error) return { error: new Error(await parseFunctionsInvokeError(error)) }
    if (data?.error) return { error: new Error(data.error) }
    return { error: null }
  },

  /** LLM-drafted first outreach message for an approved reveal request. Cached server-side on
   * employer_reveal_requests after first generation - safe to call again, a cache hit costs one
   * DB read and no LLM call. */
  async generateOutreachDraft(
    requestId: string,
  ): Promise<{ data: { subject: string; body: string } | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{
      subject?: string
      body?: string
      error?: string
    }>('generate-outreach-draft', { body: { request_id: requestId } })

    if (error) return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    if (data?.error) return { data: null, error: new Error(data.error) }
    if (!data?.subject || !data?.body) return { data: null, error: new Error('Unexpected response') }
    return { data: { subject: data.subject, body: data.body }, error: null }
  },
}
