/**
 * Request handling for the reply-ingest edge function: store one parsed inbound reply in
 * reply_events, matched to whoever we emailed. Kept here so tests can drive it without a
 * server or a DB.
 *
 * The sender is matched against institutional_leads.contact_email (organization leads),
 * prospects.email_normalized (person-level leads) and profiles.email (signed-up users);
 * any, all or none may match, and each match is stored on the row.
 *
 * Idempotent on the email's Message-ID: a re-delivered email (same messageId) returns the
 * existing row instead of creating a second one. Without a messageId every POST is new.
 */

import { normalizeEmail } from "./unsubscribe-token.ts"

export interface ReplyIngestBody {
  fromEmail?: string
  subject?: string
  body?: string
  receivedAt?: string
  /** The email's Message-ID header. */
  messageId?: string
}

export interface ReplyEventInsert {
  institutional_lead_id: string | null
  prospect_id: string | null
  profile_id: string | null
  message_id: string | null
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
  /** Profile whose email equals the (already normalized) address. */
  findProfileIdByEmail: (emailNormalized: string) => Promise<string | null>
  /** Inserts the row; with a message_id that already exists, inserts nothing and returns
   * the existing row's id with duplicate: true. */
  insertReply: (row: ReplyEventInsert) => Promise<{ id: string; duplicate: boolean }>
  now?: () => Date
}

/** "<abc@mail.x>" -> "abc@mail.x"; null when absent or blank. */
export function normalizeMessageId(raw: string | undefined | null): string | null {
  const t = raw?.trim().replace(/^<+|>+$/g, '').trim()
  return t ? t.slice(0, 998) : null
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
    let profileId: string | null
    const normalized = normalizeEmail(fromEmail)
    try {
      ;[leadId, prospectId, profileId] = await Promise.all([
        deps.findLeadIdByEmail(fromEmail),
        normalized ? deps.findProspectIdByEmail(normalized) : Promise.resolve(null),
        normalized ? deps.findProfileIdByEmail(normalized) : Promise.resolve(null),
      ])
    } catch (err) {
      console.error("reply-ingest: failed to look up the sender", { error: err instanceof Error ? err.message : String(err) })
      return json({ error: "Failed to look up sender" }, 500)
    }

    try {
      const { id, duplicate } = await deps.insertReply({
        institutional_lead_id: leadId,
        prospect_id: prospectId,
        profile_id: profileId,
        message_id: normalizeMessageId(body.messageId),
        from_email: fromEmail,
        raw_subject: body.subject ?? null,
        raw_body: body.body ?? null,
        received_at: body.receivedAt ?? (deps.now?.() ?? new Date()).toISOString(),
      })
      // 200 for a duplicate too, so the email worker doesn't retry it.
      return json({ id, duplicate, matchedLeadId: leadId, matchedProspectId: prospectId, matchedProfileId: profileId }, 200)
    } catch (err) {
      console.error("reply-ingest: failed to insert reply_events row", { error: err instanceof Error ? err.message : String(err) })
      return json({ error: "Failed to store reply" }, 500)
    }
  }
}
