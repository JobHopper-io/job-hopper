/** Referring hostnames worth naming explicitly; anything else falls back to the raw host. */
const KNOWN_REFERRER_HOSTS: Record<string, string> = {
  'google.com': 'google',
  'www.google.com': 'google',
  'bing.com': 'bing',
  'duckduckgo.com': 'duckduckgo',
  'linkedin.com': 'linkedin',
  'www.linkedin.com': 'linkedin',
  'instagram.com': 'instagram',
  'l.instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'www.facebook.com': 'facebook',
  'm.facebook.com': 'facebook',
  'twitter.com': 'twitter/x',
  'x.com': 'twitter/x',
  't.co': 'twitter/x',
  'reddit.com': 'reddit',
  'www.reddit.com': 'reddit',
}

function normalizeReferrerHost(host: string): string {
  return KNOWN_REFERRER_HOSTS[host.toLowerCase()] ?? host
}

/**
 * First-touch channel a signup is attributed to, in priority order:
 *   1. utm_source (explicit campaign tag) - shown as its own value, e.g. "linkedin".
 *   2. landing_path (set only on the generated static SEO pages) - "seo".
 *   3. referrer_host (browser-supplied, no tagging needed) - "<host> (organic)".
 *   4. otherwise "direct" (typed URL, bookmark, or a referrer the browser withheld).
 */
export function deriveAcquisitionChannel(profile: {
  landing_path: string | null
  utm_source: string | null
  referrer_host: string | null
}): string {
  if (profile.utm_source) return profile.utm_source.trim().toLowerCase()
  if (profile.landing_path) return 'seo'
  if (profile.referrer_host) return `${normalizeReferrerHost(profile.referrer_host)} (organic)`
  return 'direct'
}
