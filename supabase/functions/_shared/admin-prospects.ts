/**
 * Request handling for the admin-prospects edge function (the /admin/prospects review queue).
 * Kept here so tests can drive it with fakes instead of a server and a DB.
 *
 *   GET  ?review_status=&segment=&min_score=&has_email=&limit=&offset=
 *        -> { prospects, total, stats }   sorted by intent_score desc
 *   POST { prospectId, action: approve | reject | do_not_contact,
 *          targetJobTitle?, careerLevel? }  -> { prospect }
 *
 * Admin-gated like the other admin functions (caller's JWT + current_user_has_role('admin');
 * super_admin implies admin server-side). Emails leave the server only masked. A review sets
 * review_status, reviewed_at and reviewed_by (the caller's profile id); do_not_contact also
 * sets prospects.do_not_contact. Nothing here writes email or consent_status.
 */

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const
export const SEGMENTS = ["active_job_seeker", "recent_graduate", "remote_seeker", "career_changer", "laid_off", "experienced_professional"] as const
export const CAREER_LEVELS = ["entry_mid", "senior_management", "director_vp_c_level"] as const
export const ACTIONS = ["approve", "reject", "do_not_contact"] as const
const MAX_LIMIT = 100
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ReviewAction = (typeof ACTIONS)[number]

export interface ListFilters {
  reviewStatus: (typeof REVIEW_STATUSES)[number] | null
  segment: (typeof SEGMENTS)[number] | null
  minScore: number | null
  hasEmail: boolean | null
  limit: number
  offset: number
}

export interface ReviewPatch {
  review_status: "approved" | "rejected"
  reviewed_at: string
  reviewed_by: string
  do_not_contact?: true
  target_job_title?: string
  career_level?: (typeof CAREER_LEVELS)[number]
}

export interface AdminProspectsDeps {
  /** auth.getUser() with the caller's JWT; null if not signed in. */
  getCallerUserId: (authHeader: string) => Promise<string | null>
  /** current_user_has_role('admin') as the caller. */
  isAdmin: (authHeader: string) => Promise<boolean>
  getProfileId: (userId: string) => Promise<string | null>
  listProspects: (filters: ListFilters) => Promise<{ prospects: unknown[]; total: number }>
  getStats: () => Promise<Record<string, number>>
  reviewProspect: (prospectId: string, patch: ReviewPatch) => Promise<unknown | null>
  now?: () => Date
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf("@")
  return at <= 0 ? "***" : `${email[0]}***${email.slice(at)}`
}

/** Query string -> filters, or an error message. */
export function parseListFilters(params: URLSearchParams): { ok: true; filters: ListFilters } | { ok: false; error: string } {
  const reviewStatus = params.get("review_status")
  if (reviewStatus && !(REVIEW_STATUSES as readonly string[]).includes(reviewStatus)) return { ok: false, error: "Invalid review_status" }
  const segment = params.get("segment")
  if (segment && !(SEGMENTS as readonly string[]).includes(segment)) return { ok: false, error: "Invalid segment" }
  const minScoreRaw = params.get("min_score")
  const minScore = minScoreRaw === null || minScoreRaw === "" ? null : Number(minScoreRaw)
  if (minScore !== null && (!Number.isInteger(minScore) || minScore < 0 || minScore > 100)) return { ok: false, error: "Invalid min_score" }
  const hasEmailRaw = params.get("has_email")
  if (hasEmailRaw !== null && hasEmailRaw !== "" && hasEmailRaw !== "true" && hasEmailRaw !== "false") return { ok: false, error: "Invalid has_email" }
  const limit = Number(params.get("limit") ?? 50)
  const offset = Number(params.get("offset") ?? 0)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return { ok: false, error: `limit must be 1-${MAX_LIMIT}` }
  if (!Number.isInteger(offset) || offset < 0) return { ok: false, error: "Invalid offset" }
  return {
    ok: true,
    filters: {
      reviewStatus: (reviewStatus || null) as ListFilters["reviewStatus"],
      segment: (segment || null) as ListFilters["segment"],
      minScore,
      hasEmail: hasEmailRaw === "true" ? true : hasEmailRaw === "false" ? false : null,
      limit,
      offset,
    },
  }
}

/** POST body -> review patch (minus reviewer fields), or an error message. */
export function parseReviewBody(body: unknown):
  | { ok: true; prospectId: string; action: ReviewAction; targetJobTitle?: string; careerLevel?: (typeof CAREER_LEVELS)[number] }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid JSON body" }
  const b = body as Record<string, unknown>
  if (typeof b.prospectId !== "string" || !UUID_RE.test(b.prospectId)) return { ok: false, error: "Invalid prospectId" }
  if (typeof b.action !== "string" || !(ACTIONS as readonly string[]).includes(b.action)) {
    return { ok: false, error: `action must be one of ${ACTIONS.join(", ")}` }
  }
  let targetJobTitle: string | undefined
  if (b.targetJobTitle !== undefined && b.targetJobTitle !== null && b.targetJobTitle !== "") {
    if (typeof b.targetJobTitle !== "string") return { ok: false, error: "Invalid targetJobTitle" }
    targetJobTitle = b.targetJobTitle.trim().replace(/\s+/g, " ")
    if (targetJobTitle.length < 2 || targetJobTitle.length > 80) return { ok: false, error: "targetJobTitle must be 2-80 characters" }
  }
  let careerLevel: (typeof CAREER_LEVELS)[number] | undefined
  if (b.careerLevel !== undefined && b.careerLevel !== null && b.careerLevel !== "") {
    if (typeof b.careerLevel !== "string" || !(CAREER_LEVELS as readonly string[]).includes(b.careerLevel)) {
      return { ok: false, error: `careerLevel must be one of ${CAREER_LEVELS.join(", ")}` }
    }
    careerLevel = b.careerLevel as (typeof CAREER_LEVELS)[number]
  }
  // Anything else in the body (email, consent_status, review_status, ...) is ignored, never written.
  return { ok: true, prospectId: b.prospectId, action: b.action as ReviewAction, targetJobTitle, careerLevel }
}

export function buildReviewPatch(
  review: { action: ReviewAction; targetJobTitle?: string; careerLevel?: (typeof CAREER_LEVELS)[number] },
  reviewerProfileId: string,
  now: Date,
): ReviewPatch {
  const patch: ReviewPatch = {
    review_status: review.action === "approve" ? "approved" : "rejected",
    reviewed_at: now.toISOString(),
    reviewed_by: reviewerProfileId,
  }
  if (review.action === "do_not_contact") patch.do_not_contact = true
  if (review.targetJobTitle) patch.target_job_title = review.targetJobTitle
  if (review.careerLevel) patch.career_level = review.careerLevel
  return patch
}

export function createAdminProspectsHandler(deps: AdminProspectsDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405)

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "Missing authorization header" }, 401)

    try {
      const userId = await deps.getCallerUserId(authHeader)
      if (!userId) return json({ error: "Unauthorized" }, 401)
      let admin: boolean
      try {
        admin = await deps.isAdmin(authHeader)
      } catch (err) {
        console.error("admin-prospects: role check failed", err)
        return json({ error: "Failed to verify admin status" }, 500)
      }
      if (!admin) return json({ error: "Only admins can review prospects" }, 403)

      if (req.method === "GET") {
        const parsed = parseListFilters(new URL(req.url).searchParams)
        if (!parsed.ok) return json({ error: parsed.error }, 400)
        const [{ prospects, total }, stats] = await Promise.all([deps.listProspects(parsed.filters), deps.getStats()])
        return json({ prospects, total, stats }, 200)
      }

      let body: unknown
      try {
        body = await req.json()
      } catch {
        return json({ error: "Invalid JSON body" }, 400)
      }
      const review = parseReviewBody(body)
      if (!review.ok) return json({ error: review.error }, 400)
      const reviewerProfileId = await deps.getProfileId(userId)
      if (!reviewerProfileId) return json({ error: "Reviewer has no profile" }, 403)
      const patch = buildReviewPatch(review, reviewerProfileId, deps.now?.() ?? new Date())
      const prospect = await deps.reviewProspect(review.prospectId, patch)
      if (!prospect) return json({ error: "Prospect not found" }, 404)
      return json({ prospect }, 200)
    } catch (err) {
      console.error("admin-prospects: unexpected error", err)
      return json({ error: "Internal server error" }, 500)
    }
  }
}
