import { supabase } from '@/lib/supabase'

/**
 * What the confirm page can show before the user clicks: read from the token's payload
 * WITHOUT verifying the signature (that happens server-side on confirm). v1 tokens
 * carry no address, so email is null for them.
 */
export interface UnsubscribeTokenPreview {
  email: string | null
  scope: 'marketing' | 'all'
  expired: boolean
}

export function previewUnsubscribeToken(token: string | null | undefined): UnsubscribeTokenPreview | null {
  if (!token) return null
  const payloadB64 = token.split('.')[0]
  if (!payloadB64) return null
  try {
    let base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4 !== 0) base64 += '='
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
      v?: number
      email_normalized?: unknown
      scope?: unknown
      exp?: unknown
    }
    if (typeof payload.exp !== 'number') return null
    return {
      email: payload.v === 2 && typeof payload.email_normalized === 'string' ? payload.email_normalized : null,
      scope: payload.v === 2 && payload.scope === 'marketing' ? 'marketing' : 'all',
      expired: payload.exp < Date.now() / 1000,
    }
  } catch {
    return null
  }
}

/** "reader@example.com" -> "r***@example.com", so a forwarded link or a shoulder-surfer
 * doesn't expose the full address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '***'
  return `${email[0]}***${email.slice(at)}`
}

export type ConfirmUnsubscribeResult = { status: 'done' } | { status: 'invalid' } | { status: 'error' }

export const unsubscribeAPI = {
  /** POSTs the token to the unsubscribe-email function (JSON body). Safe to repeat. */
  async confirm(token: string): Promise<ConfirmUnsubscribeResult> {
    const { error } = await supabase.functions.invoke('unsubscribe-email', { body: { token } })
    if (!error) return { status: 'done' }
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response && ctx.status === 400) return { status: 'invalid' }
    console.error('unsubscribe confirm failed:', error)
    return { status: 'error' }
  },
}
