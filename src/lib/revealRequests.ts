import { supabase } from '@/lib/supabase'
import { parseFunctionsInvokeError } from '@/lib/parse-functions-invoke-error'
import type { EmployerRevealRequest } from '@/types/database'

export const revealRequestsAPI = {
  /** Reveal requests targeting the current seeker, newest first - RLS scopes rows to their own profile. */
  async getIncoming(): Promise<{ data: EmployerRevealRequest[] | null; error: Error | null }> {
    const { data, error } = await supabase
      .from('employer_reveal_requests')
      .select('*')
      .order('created_at', { ascending: false })

    return { data: data ?? null, error }
  },

  /** Approve or decline a pending request. On approve, the employer receives contact details;
   * on decline, nothing is shared and the employer isn't told why. */
  async respond(
    requestId: string,
    decision: 'approved' | 'declined',
  ): Promise<{ error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
      'seeker-respond-reveal-request',
      { body: { request_id: requestId, decision } },
    )

    if (error) return { error: new Error(await parseFunctionsInvokeError(error)) }
    if (data?.error) return { error: new Error(data.error) }
    return { error: null }
  },
}
