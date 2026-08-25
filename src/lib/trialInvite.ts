import { supabase } from '@/lib/supabase'
import { parseFunctionsInvokeError } from '@/lib/parse-functions-invoke-error'

export interface TrialInviteResolution {
  valid: boolean
  organizationName?: string
  featureTier?: 'free' | 'core' | 'premium'
  error?: string
}

export const trialInviteAPI = {
  /** Public, unauthenticated lookup — no side effects (the seat is claimed at signup, not here). */
  async resolve(code: string): Promise<{ data: TrialInviteResolution | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<TrialInviteResolution>('resolve-trial-invite', {
      body: { code },
    })
    if (error) {
      return { data: null, error: new Error(await parseFunctionsInvokeError(error)) }
    }
    return { data: data ?? null, error: null }
  },
}
