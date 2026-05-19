import { FunctionsHttpError } from '@supabase/functions-js'
import { supabase } from '@/lib/supabase'
import { mapPremiumInsightsClientError } from '@/lib/premiumInsightsErrors'
import type { JobContact } from '@/types/database'

export type PremiumInsightsSuccess = {
  status: 'complete'
  contacts: JobContact[]
  company_summary: Record<string, unknown> | null
}

export type PremiumInsightsRunMeta = {
  cachedMiss?: boolean
  freemiumCreditNeverConsumed?: boolean
  freemiumCreditRefunded?: boolean
}

type PremiumInsightsFailedPayload = {
  status: 'failed'
  error_code?: string
  user_message?: string
  cached_miss?: boolean
  freemium_credit_never_consumed?: boolean
  freemium_credit_refunded?: boolean
}

type PremiumInsightsFnResponse =
  | PremiumInsightsSuccess
  | (PremiumInsightsFailedPayload & { error?: string })
  | { status?: string; error?: string; contacts?: unknown }

function parseCompanySummary(value: unknown): Record<string, unknown> | null {
  if (value == null) return null
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function metaFromFailedPayload(p: PremiumInsightsFailedPayload): PremiumInsightsRunMeta {
  return {
    cachedMiss: p.cached_miss === true,
    freemiumCreditNeverConsumed: p.freemium_credit_never_consumed === true,
    freemiumCreditRefunded: p.freemium_credit_refunded === true,
  }
}

function messageFromFailedPayload(p: PremiumInsightsFailedPayload): string {
  if (typeof p.user_message === 'string' && p.user_message.trim()) return p.user_message.trim()
  return mapPremiumInsightsClientError(String(p.error_code ?? 'error'))
}

async function tryParseFailedBodyFromFunctionsHttpError(
  err: unknown,
): Promise<PremiumInsightsFailedPayload | null> {
  if (!(err instanceof FunctionsHttpError)) return null
  const res = err.context as Response
  const ct = res.headers.get('Content-Type')?.split(';')[0]?.trim()
  if (ct !== 'application/json') return null
  try {
    const body = (await res.json()) as PremiumInsightsFailedPayload
    return body?.status === 'failed' ? body : null
  } catch {
    return null
  }
}

/** Short reassurance line for freemium users; omit when add-on or flags are absent / not applicable. */
export function premiumInsightsFreemiumReassurance(
  meta: PremiumInsightsRunMeta | null,
  hasPremiumInsightsAddon: boolean,
): string | null {
  if (hasPremiumInsightsAddon || !meta) return null
  if (meta.freemiumCreditRefunded) {
    return 'Your free Premium Insights credit has been restored.'
  }
  if (meta.freemiumCreditNeverConsumed) {
    return 'Your free Premium Insights credit was not used.'
  }
  return null
}

export const premiumInsightsAPI = {
  /**
   * Runs the premium-insights edge function for a job match (sync; may take several seconds).
   */
  async runForJobMatch(jobMatchId: string): Promise<{
    data: PremiumInsightsSuccess | null
    error: Error | null
    meta: PremiumInsightsRunMeta | null
  }> {
    const { data, error } = await supabase.functions.invoke<PremiumInsightsFnResponse>(
      'premium-insights',
      { body: { job_match_id: jobMatchId } },
    )

    if (!error && data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      if (d.status === 'failed') {
        const payload = d as PremiumInsightsFailedPayload
        return {
          data: null,
          error: new Error(messageFromFailedPayload(payload)),
          meta: metaFromFailedPayload(payload),
        }
      }
    }

    if (error) {
      const parsed = await tryParseFailedBodyFromFunctionsHttpError(error)
      if (parsed) {
        return {
          data: null,
          error: new Error(messageFromFailedPayload(parsed)),
          meta: metaFromFailedPayload(parsed),
        }
      }
      return { data: null, error: new Error(error.message), meta: null }
    }

    if (data && typeof data === 'object' && 'error' in data && data.error) {
      return {
        data: null,
        error: new Error(mapPremiumInsightsClientError(String(data.error))),
        meta: null,
      }
    }
    if (
      data &&
      data.status === 'complete' &&
      Array.isArray(data.contacts)
    ) {
      return {
        data: {
          status: 'complete',
          contacts: data.contacts as JobContact[],
          company_summary:
            'company_summary' in data
              ? parseCompanySummary((data as PremiumInsightsSuccess).company_summary)
              : null,
        },
        error: null,
        meta: null,
      }
    }
    return {
      data: null,
      error: new Error(mapPremiumInsightsClientError('Unexpected response from premium insights')),
      meta: null,
    }
  },
}
