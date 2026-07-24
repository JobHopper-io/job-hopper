export type AcquisitionChannel = 'seo' | 'paid' | 'direct'

/**
 * First-touch channel a signup is attributed to. landing_path (set only on the
 * generated static SEO pages) wins over utm_source since a paid click that lands
 * on an SEO page is still an SEO-page conversion for this report's purposes.
 */
export function deriveAcquisitionChannel(profile: {
  landing_path: string | null
  utm_source: string | null
}): AcquisitionChannel {
  if (profile.landing_path) return 'seo'
  if (profile.utm_source) return 'paid'
  return 'direct'
}
