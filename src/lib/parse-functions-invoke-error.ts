/**
 * Extract a user-visible message from supabase.functions.invoke failures.
 * Non-2xx responses expose the JSON body on `error.context` as a `Response` (must be read once).
 */
export async function parseFunctionsInvokeError(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      try {
        const body = (await ctx.clone().json()) as { error?: string; detail?: string; message?: string }
        if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
        if (typeof body.detail === 'string' && body.detail.trim()) return body.detail.trim()
        if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
      } catch {
        // fall through
      }
    }
    if (ctx && typeof ctx === 'object' && 'body' in ctx) {
      const raw = (ctx as { body?: unknown }).body
      if (typeof raw === 'string' && raw.length > 0) {
        try {
          const parsed = JSON.parse(raw) as { error?: string; detail?: string }
          if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim()
          if (typeof parsed.detail === 'string' && parsed.detail.trim()) return parsed.detail.trim()
        } catch {
          return raw.slice(0, 500)
        }
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'Request failed'
}

export function errorMessageFromInvokeData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  if (!('error' in data)) return null
  const msg = (data as { error?: unknown }).error
  return typeof msg === 'string' && msg.trim() ? msg.trim() : null
}
