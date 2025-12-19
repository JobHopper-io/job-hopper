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

