// Admin-only backend for /admin/prospects: the prospect review queue. GET lists prospects
// (filters, sorted by intent_score desc, paginated, with latest evidence and send
// eligibility); POST records one review. Logic, validation and tests:
// _shared/admin-prospects.ts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { createAdminProspectsHandler, maskEmail } from "../_shared/admin-prospects.ts"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const serviceClient = createClient(supabaseUrl, serviceRoleKey)

// Same as the other admin functions: the service-role apikey lets the role RPC run, while the
// caller's own JWT in Authorization makes auth.uid() inside it the caller.
const userClientFor = (authHeader: string) =>
  createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })

const PROSPECT_COLUMNS =
  "id, created_at, kind, source, status, email_normalized, country, segments, needs_sponsorship, intent_score, intent_reason, " +
  "target_job_title, years_of_experience, career_level, target_role_categories, review_status, reviewed_at, do_not_contact, classified_at"

type ProspectRow = Record<string, unknown> & { id: string; email_normalized: string | null }

function present(row: ProspectRow, evidence?: { url: string; snippet: string | null; found_at: string }, ineligibleReason?: string | null) {
  const { email_normalized, ...rest } = row
  return {
    ...rest,
    email_masked: maskEmail(email_normalized),
    has_email: Boolean(email_normalized),
    evidence: evidence ?? null,
    ineligible_reason: ineligibleReason ?? null,
  }
}

serve(createAdminProspectsHandler({
  getCallerUserId: async (authHeader) => {
    const { data, error } = await userClientFor(authHeader).auth.getUser()
    return error || !data.user ? null : data.user.id
  },
  isAdmin: async (authHeader) => {
    const { data, error } = await userClientFor(authHeader).rpc("current_user_has_role", { role_name: "admin" })
    if (error) throw new Error(error.message)
    return data === true
  },
  getProfileId: async (userId) => {
    const { data, error } = await serviceClient.from("profiles").select("id").eq("auth_user_id", userId).maybeSingle()
    if (error) throw new Error(error.message)
    return data?.id ?? null
  },
  listProspects: async (filters) => {
    let query = serviceClient.from("prospects").select(PROSPECT_COLUMNS, { count: "exact" })
    if (filters.reviewStatus) query = query.eq("review_status", filters.reviewStatus)
    if (filters.segment) query = query.contains("segments", [filters.segment])
    if (filters.minScore !== null) query = query.gte("intent_score", filters.minScore)
    if (filters.hasEmail === true) query = query.not("email_normalized", "is", null)
    if (filters.hasEmail === false) query = query.is("email_normalized", null)
    const { data, error, count } = await query
      .order("intent_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true })
      .range(filters.offset, filters.offset + filters.limit - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as ProspectRow[]
    if (rows.length === 0) return { prospects: [], total: count ?? 0 }

    const ids = rows.map((r) => r.id)
    const [{ data: evidence, error: evError }, { data: eligibility, error: elError }] = await Promise.all([
      serviceClient.from("prospect_evidence").select("prospect_id, url, snippet, found_at").in("prospect_id", ids)
        .order("found_at", { ascending: false }),
      serviceClient.from("prospect_send_eligibility").select("prospect_id, ineligible_reason").in("prospect_id", ids),
    ])
    if (evError) throw new Error(evError.message)
    if (elError) throw new Error(elError.message)
    const latest = new Map<string, { url: string; snippet: string | null; found_at: string }>()
    for (const e of evidence ?? []) {
      if (!latest.has(e.prospect_id)) latest.set(e.prospect_id, { url: e.url, snippet: e.snippet, found_at: e.found_at })
    }
    const reason = new Map((eligibility ?? []).map((e) => [e.prospect_id as string, e.ineligible_reason as string | null]))
    return { prospects: rows.map((r) => present(r, latest.get(r.id), reason.get(r.id))), total: count ?? rows.length }
  },
  getStats: async () => {
    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const head = (build: (q: ReturnType<typeof serviceClient.from>) => unknown) => build(serviceClient.from("prospects")) as Promise<{ count: number | null; error: unknown }>
    const [pending, approved, rejected, reviewedToday] = await Promise.all([
      head((q) => q.select("id", { count: "exact", head: true }).eq("review_status", "pending")),
      head((q) => q.select("id", { count: "exact", head: true }).eq("review_status", "approved")),
      head((q) => q.select("id", { count: "exact", head: true }).eq("review_status", "rejected")),
      head((q) => q.select("id", { count: "exact", head: true }).gte("reviewed_at", startOfDay.toISOString())),
    ])
    for (const r of [pending, approved, rejected, reviewedToday]) if (r.error) throw new Error(String((r.error as { message?: string }).message ?? r.error))
    return {
      pending: pending.count ?? 0,
      approved: approved.count ?? 0,
      rejected: rejected.count ?? 0,
      reviewed_today: reviewedToday.count ?? 0,
    }
  },
  reviewProspect: async (prospectId, patch) => {
    const { data, error } = await serviceClient.from("prospects").update(patch).eq("id", prospectId).select(PROSPECT_COLUMNS).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? present(data as unknown as ProspectRow) : null
  },
}))
