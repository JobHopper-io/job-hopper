import { supabase } from '@/lib/supabase'
import { parseFunctionsInvokeError, errorMessageFromInvokeData } from '@/lib/parse-functions-invoke-error'

/** Matches institutional_leads.category — see docs/db-schema-summary.md. */
export type PartnerLeadCategory = 'university' | 'employer' | 'career_partner' | 'workforce_org'

export interface PartnerLeadSubmission {
  organizationName: string
  category: PartnerLeadCategory
  email: string
  name: string
  title: string
}

export const partnerLeadsAPI = {
  async submit(submission: PartnerLeadSubmission): Promise<{ error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
      'submit-partner-lead',
      { body: submission },
    )
    if (error) {
      return { error: new Error(await parseFunctionsInvokeError(error)) }
    }
    const dataError = errorMessageFromInvokeData(data)
    if (dataError) {
      return { error: new Error(dataError) }
    }
    return { error: null }
  },
}
