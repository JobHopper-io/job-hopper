import { FunctionsHttpError } from '@supabase/functions-js'
import { supabase } from '@/lib/supabase'
import {
  mapPremiumInsightsClientError,
} from '@/lib/premiumInsightsErrors'
import type { JobContact, PremiumInsightsOrgChoice } from '@/types/database'

export type { PremiumInsightsOrgChoice }

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

export type PremiumInsightsNeedsOrgChoice = {
  jobMatchId: string
  organizations: PremiumInsightsOrgChoice[]
}

export type PremiumInsightsInvocationResult = {
  data: PremiumInsightsSuccess | null
  error: Error | null
  meta: PremiumInsightsRunMeta | null
  needsOrgChoice: PremiumInsightsNeedsOrgChoice | null
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
  try {
    const body = (await res.json()) as PremiumInsightsFailedPayload & { error_code?: string }
    if (body?.status === 'failed') return body
    if (typeof body?.error_code === 'string' && body.error_code) {
      return {
        status: 'failed',
        error_code: body.error_code,
        user_message: body.user_message,
        cached_miss: body.cached_miss,
        freemium_credit_never_consumed: body.freemium_credit_never_consumed,
        freemium_credit_refunded: body.freemium_credit_refunded,
      }
    }
    return null
  } catch {
    return null
  }
}

function parseNeedsOrgChoice(
  d: Record<string, unknown>,
  fallbackJobMatchId: string,
): PremiumInsightsNeedsOrgChoice | null {
  if (d.status !== 'needs_org_choice') return null
  const orgs = d.organizations
  const jmid =
    typeof d.job_match_id === 'string' && d.job_match_id.trim()
      ? d.job_match_id.trim()
      : fallbackJobMatchId
  if (!Array.isArray(orgs)) return null
  const organizations: PremiumInsightsOrgChoice[] = []
  for (const item of orgs) {
    if (!item || typeof item !== 'object') return null
    const o = item as Record<string, unknown>
    const apollo_organization_id =
      typeof o.apollo_organization_id === 'string' ? o.apollo_organization_id.trim() : ''
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const score = typeof o.score === 'number' ? o.score : NaN
    if (!apollo_organization_id || !name || Number.isNaN(score)) return null
    organizations.push({
      apollo_organization_id,
      name,
      primary_domain: typeof o.primary_domain === 'string' ? o.primary_domain : null,
      score,
    })
  }
  if (!organizations.length) return null
  return { jobMatchId: jmid, organizations }
}

async function invokePremiumInsights(
  body: Record<string, unknown>,
  jobMatchIdForChoice: string,
): Promise<PremiumInsightsInvocationResult> {
  const empty: PremiumInsightsInvocationResult = {
    data: null,
    error: null,
    meta: null,
    needsOrgChoice: null,
  }

  const { data, error } = await supabase.functions.invoke<PremiumInsightsFnResponse>(
    'premium-insights',
    { body },
  )

  if (!error && data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const choice = parseNeedsOrgChoice(d, jobMatchIdForChoice)
    if (choice) {
      return { ...empty, needsOrgChoice: choice }
    }
    if (d.status === 'failed') {
      const payload = d as PremiumInsightsFailedPayload
      return {
        data: null,
        error: new Error(messageFromFailedPayload(payload)),
        meta: metaFromFailedPayload(payload),
        needsOrgChoice: null,
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
        needsOrgChoice: null,
      }
    }
    return { data: null, error: new Error(error.message), meta: null, needsOrgChoice: null }
  }

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return {
      data: null,
      error: new Error(mapPremiumInsightsClientError(String(data.error))),
      meta: null,
      needsOrgChoice: null,
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
      needsOrgChoice: null,
    }
  }
  return {
    data: null,
    error: new Error(mapPremiumInsightsClientError('Unexpected response from premium insights')),
    meta: null,
    needsOrgChoice: null,
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
  async runForJobMatch(jobMatchId: string): Promise<PremiumInsightsInvocationResult> {
    return invokePremiumInsights({ job_match_id: jobMatchId }, jobMatchId)
  },

  /**
   * Continues Premium Insights after the user picks an Apollo org from a tie, or declines (`decline: true`).
   */
  async resolveOrgDisambiguation(
    jobMatchId: string,
    resolution: { decline: true } | { selectedApolloOrganizationId: string },
  ): Promise<PremiumInsightsInvocationResult> {
    const body: Record<string, unknown> = { job_match_id: jobMatchId }
    if ('decline' in resolution && resolution.decline === true) {
      body.decline_org_disambiguation = true
    } else if ('selectedApolloOrganizationId' in resolution) {
      body.selected_apollo_organization_id = resolution.selectedApolloOrganizationId
    }
    return invokePremiumInsights(body, jobMatchId)
  },
}
