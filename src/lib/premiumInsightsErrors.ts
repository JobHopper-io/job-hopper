/** User-facing copy for Premium Insights edge / RPC error codes. */
export function mapPremiumInsightsClientError(raw: string): string {
  const t = raw.trim()
  if (t === 'apollo_exhausted') {
    return 'Contact lookups are temporarily unavailable. Please try again later.'
  }
  if (t === 'quota_exceeded' || t === 'disabled') {
    return 'You have used all free Premium Insights credits for now.'
  }
  if (t === 'Another job is already processing' || t.includes('Another job')) {
    return 'Another hiring contact lookup is already running. Wait for it to finish or try again in a few minutes.'
  }
  if (t === 'ambiguous_org' || t === 'org_not_found' || t === 'no_contacts' || t === 'match_failed') {
    return 'We could not confidently identify a hiring contact for this posting.'
  }
  if (t === 'cached_resolution_miss') {
    return 'We could not find a hiring contact for this job recently. Try again in about a week, or contact support if this keeps happening.'
  }
  return t || 'Something went wrong. Please try again.'
}
