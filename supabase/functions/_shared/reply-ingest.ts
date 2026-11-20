/**
 * Request handling for the reply-ingest edge function: store one parsed inbound reply in
 * reply_events, matched to whoever we emailed. Kept here so tests can drive it without a
 * server or a DB.
 *
 * The sender is matched against both institutional_leads.contact_email (organization
 * leads) and prospects.email_normalized (person-level leads); either, both or neither may
 * match, and each match is stored on the row.
 */

import { normalizeEmail } from "./unsubscribe-token.ts"

export interface ReplyIngestBody {
  fromEmail?: string
  subject?: string
  body?: string
  receivedAt?: string
}

export interface ReplyEventInsert {
  institutional_lead_id: string | null
  prospect_id: string | null
  from_email: string
  raw_subject: string | null
  raw_body: string | null
  received_at: string
}

export interface ReplyIngestDeps {
  isAuthorized: (req: Request) => boolean
  /** Most recently updated lead whose contact_email equals the address (case-insensitive). */
  findLeadIdByEmail: (fromEmail: string) => Promise<string | null>
  /** Prospect whose email_normalized equals the (already normalized) address. */
  findProspectIdByEmail: (emailNormalized: string) => Promise<string | null>
  insertReply: (row: ReplyEventInsert) => Promise<string>
  now?: () => Date
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reply-ingest-secret",
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

export function createReplyIngestHandler(deps: ReplyIngestDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
    if (!deps.isAuthorized(req)) return json({ error: "Unauthorized" }, 401)

    let body: ReplyIngestBody
    try {
      body = (await req.json()) as ReplyIngestBody
    } catch {
      return json({ error: "Invalid JSON body" }, 400)
    }

    const fromEmail = body.fromEmail?.trim()
    if (!fromEmail) return json({ error: "fromEmail is required" }, 400)

    let leadId: string | null
    let prospectId: string | null
    try {
      ;[leadId, prospectId] = await Promise.all([
        deps.findLeadIdByEmail(fromEmail),
        normalizeEmail(fromEmail) ? deps.findProspectIdByEmail(normalizeEmail(fromEmail)) : Promise.resolve(null),
      ])
    } catch (err) {
      console.error("reply-ingest: failed to look up the sender", { error: err instanceof Error ? err.message : String(err) })
      return json({ error: "Failed to look up sender" }, 500)
    }

    try {
      const id = await deps.insertReply({
        institutional_lead_id: leadId,
        prospect_id: prospectId,
        from_email: fromEmail,
        raw_subject: body.subject ?? null,
        raw_body: body.body ?? null,
        received_at: body.receivedAt ?? (deps.now?.() ?? new Date()).toISOString(),
      })
      return json({ id, matchedLeadId: leadId, matchedProspectId: prospectId }, 200)
    } catch (err) {
      console.error("reply-ingest: failed to insert reply_events row", { error: err instanceof Error ? err.message : String(err) })
      return json({ error: "Failed to store reply" }, 500)
    }
  }
}
