/** Shown when Apollo could not resolve a contact for this job. */
export const PREMIUM_INSIGHTS_NO_CONTACT_MESSAGE =
  "We couldn't find a hiring contact for this job."

function isGenericEdgeFunctionInvokeError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('edge function returned a non-2xx') ||
    lower.includes('failed to send a request to the edge function') ||
    lower.includes('functionshttperror')
  )
}

/** User-facing copy for Premium Insights edge / RPC error codes. */
export function mapPremiumInsightsClientError(raw: string): string {
  const t = raw.trim()
  if (!t || isGenericEdgeFunctionInvokeError(t)) {
    return PREMIUM_INSIGHTS_NO_CONTACT_MESSAGE
  }
  if (t === 'apollo_exhausted') {
    return 'Contact lookups are temporarily unavailable. Please try again later.'
  }
  if (t === 'quota_exceeded' || t === 'disabled') {
    return 'You have used all free Premium Insights credits for now.'
  }
  if (t === 'Another job is already processing' || t.includes('Another job')) {
    return 'Another hiring contact lookup is already running. Wait for it to finish or try again in a few minutes.'
  }
  if (
    t === 'org_not_found' ||
    t === 'no_contacts' ||
    t === 'match_failed' ||
    t === 'cached_resolution_miss' ||
    t === 'user_declined_org_choice'
  ) {
    return PREMIUM_INSIGHTS_NO_CONTACT_MESSAGE
  }
  if (t === 'org_search_error' || t === 'people_search_error') {
    return 'The hiring-contact service had a problem. Please try again in a few minutes.'
  }
  return t
}
