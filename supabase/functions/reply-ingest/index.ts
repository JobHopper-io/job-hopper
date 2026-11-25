// Ingests one parsed inbound reply email into reply_events, matching the sender against
// institutional_leads.contact_email, prospects.email_normalized and profiles.email, and
// ignoring a re-delivered email (same Message-ID). The Cloudflare Email
// Worker (email-router-worker/) POSTs here for replies to the job-hopper.co inboxes;
// anything else that watches an inbox can POST the same JSON. Classification
// (reply_events.reply_class) is done separately by classify-replies.
//
// No per-source signature scheme exists (unlike Mailtrap's bounce webhook), so this uses
// the same shared-secret pattern as run-scheduled-jobs: a secret header, with a
// service-role bearer accepted as a fallback for local/manual testing.
// Logic and tests: _shared/reply-ingest.ts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { ilikeExact } from "../_shared/email-match.ts"
import { createReplyIngestHandler } from "../_shared/reply-ingest.ts"

function isAuthorized(req: Request): boolean {
  const secret = Deno.env.get("REPLY_INGEST_SECRET")
  const header = req.headers.get("x-reply-ingest-secret")
  if (secret && header === secret) return true
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const auth = req.headers.get("Authorization")
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true
  return false
}

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")

serve(createReplyIngestHandler({
  isAuthorized,
  findLeadIdByEmail: async (fromEmail) => {
    // PostgREST reads "*" as a wildcard with no escape; such addresses just don't match a lead.
    if (fromEmail.includes("*")) return null
    // Exact case-insensitive match; most-recently-updated wins when two leads share a contact.
    const { data, error } = await admin
      .from("institutional_leads")
      .select("id")
      .ilike("contact_email", ilikeExact(fromEmail))
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.id ?? null
  },
  findProspectIdByEmail: async (emailNormalized) => {
    const { data, error } = await admin
      .from("prospects")
      .select("id")
      .eq("email_normalized", emailNormalized)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.id ?? null
  },
  findProfileIdByEmail: async (emailNormalized) => {
    // profiles.email isn't normalized on write; exact case-insensitive match.
    if (emailNormalized.includes("*")) return null
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", ilikeExact(emailNormalized))
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.id ?? null
  },
  insertReply: async (row) => {
    if (row.message_id) {
      // ON CONFLICT (message_id) DO NOTHING: a re-delivery inserts nothing.
      const { data, error } = await admin
        .from("reply_events")
        .upsert(row, { onConflict: "message_id", ignoreDuplicates: true })
        .select("id")
      if (error) throw new Error(error.message)
      if (data && data.length) return { id: data[0].id as string, duplicate: false }
      const { data: existing, error: findError } = await admin.from("reply_events").select("id").eq("message_id", row.message_id).single()
      if (findError) throw new Error(findError.message)
      return { id: existing.id as string, duplicate: true }
    }
    const { data, error } = await admin.from("reply_events").insert(row).select("id").single()
    if (error) throw new Error(error.message)
    return { id: data.id as string, duplicate: false }
  },
}))
