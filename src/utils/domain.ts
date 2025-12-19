/**
 * Get the base domain for the current environment
 */
export function getBaseDomain(): string {
  if (typeof window === 'undefined') return 'localhost'

  const hostname = window.location.hostname

  // Check if we're in development mode
  if (hostname === 'localhost' || hostname.includes('localhost')) {
    return 'localhost'
  }

  // In production, you would set this to your actual domain
  return window.location.hostname.split('.').slice(-2).join('.')
}

/**
 * Extract subdomain from current URL
 */
export function getSubdomainFromUrl(): string | null {
  if (typeof window === 'undefined') return null

  const hostname = window.location.hostname
  const baseDomain = getBaseDomain()

  // Check if we're on the main domain or a subdomain
  if (hostname === baseDomain || hostname === `www.${baseDomain}`) {
    return null
  }

  // Extract subdomain from the base domain
  if (hostname.endsWith(`.${baseDomain}`)) {
    const subdomain = hostname.replace(`.${baseDomain}`, '')
    return subdomain || null
  }

  return null
}

/**
 * Check if we're on the main app domain
 */
export function isAppDomain(): boolean {
  if (typeof window === 'undefined') return false

  const hostname = window.location.hostname
  const baseDomain = getBaseDomain()

  return hostname === baseDomain || hostname === `www.${baseDomain}`
}

/**
 * Check if we're on an organization subdomain
 */
export function isOrganizationSubdomain(): boolean {
  const subdomain = getSubdomainFromUrl()
  return subdomain !== null
}

/**
 * Check if we're on a subdomain (client view) or main domain (admin view)
 */
export function isClientView(): boolean {
  return getSubdomainFromUrl() !== null
}

/**
 * Get the full domain URL for an organization
 */
export function getOrganizationUrl(domain: string): string {
  if (typeof window === 'undefined') return ''

  const protocol = window.location.protocol
  const port = window.location.port ? `:${window.location.port}` : ''
  const baseDomain = getBaseDomain()

  return `${protocol}//${domain}.${baseDomain}${port}`
}

/**
 * Get the display domain for UI purposes (shows the full domain with subdomain)
 */
export function getDisplayDomain(subdomain: string): string {
  const baseDomain = getBaseDomain()
  return `${subdomain}.${baseDomain}`
}

/**
 * Check if we're running in a local development environment
 */
export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined') return true

  const hostname = window.location.hostname
  return hostname === 'localhost' ||
         hostname.includes('localhost') ||
         hostname.includes('127.0.0.1') ||
         hostname === '0.0.0.0'
}

