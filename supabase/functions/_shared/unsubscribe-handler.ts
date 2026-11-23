/**
 * Request handling for the unsubscribe-email edge function. Kept here (not in index.ts)
 * so tests can drive it without starting a server.
 *
 * GET never changes state: it redirects to the SPA confirm page, so link scanners that
 * prefetch email links can't unsubscribe anyone. POST changes state, either:
 *   - RFC 8058 one-click: token in the query string, form body "List-Unsubscribe=One-Click"
 *   - the confirm page: JSON body { token }
 * Repeating a POST is safe: apply_unsubscribe() is idempotent.
 */

import { type UnsubscribeScope, verifyUnsubscribeToken } from "./unsubscribe-token.ts"

export interface ApplyUnsubscribeInput {
  email: string | null // null for v1 tokens: resolved from the profile
  profileId: string | null
  scope: UnsubscribeScope
}

export interface UnsubscribeHandlerDeps {
  secret: string | undefined
  siteUrl: string
  /** Writes suppressed_emails (+ notification_settings for scope "all" profiles). Returns the normalized address. */
  applyUnsubscribe: (input: ApplyUnsubscribeInput) => Promise<string>
  nowSeconds?: () => number
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

/** The token from a POST, or null when the request isn't one of the two accepted shapes. */
async function tokenFromPost(req: Request): Promise<string | null> {
  const queryToken = new URL(req.url).searchParams.get("token")
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase()

  if (queryToken) {
    if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
      return null
    }
    try {
      const form = await req.formData()
      return form.get("List-Unsubscribe") === "One-Click" ? queryToken : null
    } catch {
      return null
    }
  }

  if (contentType.includes("application/json")) {
    try {
      const body = (await req.json()) as { token?: unknown }
      return typeof body.token === "string" && body.token ? body.token : null
    } catch {
      return null
    }
  }
  return null
}

export function createUnsubscribeHandler(deps: UnsubscribeHandlerDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("token")
      const target = token ? `${deps.siteUrl}/unsubscribe?token=${encodeURIComponent(token)}` : `${deps.siteUrl}/unsubscribe`
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: target } })
    }

    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

    if (!deps.secret) {
      console.error("unsubscribe-email: UNSUBSCRIBE_EMAIL_SECRET not set")
      return json({ error: "server_misconfigured" }, 500)
    }

    const token = await tokenFromPost(req)
    if (!token) return json({ error: "invalid_request" }, 400)

    const verified = await verifyUnsubscribeToken(token, deps.secret, deps.nowSeconds?.())
    if (!verified) return json({ error: "invalid_token" }, 400)

    try {
      const email = await deps.applyUnsubscribe(
        verified.v === 2
          ? { email: verified.email_normalized, profileId: verified.profile_id ?? null, scope: verified.scope }
          : { email: null, profileId: verified.profile_id, scope: "all" },
      )
      return json({ ok: true, email, scope: verified.scope }, 200)
    } catch (err) {
      console.error("unsubscribe-email: apply failed", { error: err instanceof Error ? err.message : String(err) })
      return json({ error: "server_error" }, 500)
    }
  }
}
