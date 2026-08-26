// Ingests one parsed inbound reply email into reply_events, matching the sender against
// institutional_leads.contact_email. Provider-agnostic on purpose: job-hopper.io's MX/SPF
// confirm real Google Workspace, but Gmail API credentials for it don't exist yet (see
// Inbound Reply Path build notes), so nothing calls this endpoint in production today.
// Whatever ends up watching the real inbox -- Gmail push/poll once credentials exist, or
// something else entirely -- just needs to POST the parsed message here. Classification
// (reply_events.reply_class) is a separate, already-spec'd build that reads this table.
//
// No per-source signature scheme exists (unlike Mailtrap's bounce webhook), so this uses
// the same shared-secret pattern as run-scheduled-jobs: a secret header, with a
// service-role bearer accepted as a fallback for local/manual testing.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reply-ingest-secret",
}

interface ReplyIngestBody {
  fromEmail?: string
  subject?: string
  body?: string
  receivedAt?: string
}

function isAuthorized(req: Request): boolean {
  const secret = Deno.env.get("REPLY_INGEST_SECRET")
  const header = req.headers.get("x-reply-ingest-secret")
  if (secret && header === secret) return true
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const auth = req.headers.get("Authorization")
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true
  return false
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    })
  }
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    })
  }

  let body: ReplyIngestBody
  try {
    body = (await req.json()) as ReplyIngestBody
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const fromEmail = body.fromEmail?.trim()
  if (!fromEmail) {
    return new Response(JSON.stringify({ error: "fromEmail is required" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )

  try {
    // Same case-insensitive exact-match lookup as mailtrap-bounce-webhook's contact_email
    // matching; most-recently-updated wins on the rare case of two leads sharing a contact.
    const { data: lead, error: leadError } = await admin
      .from("institutional_leads")
      .select("id")
      .ilike("contact_email", fromEmail)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leadError) {
      console.error("reply-ingest: failed to look up matching lead", leadError)
      return new Response(JSON.stringify({ error: "Failed to look up lead" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    const { data: inserted, error: insertError } = await admin
      .from("reply_events")
      .insert({
        institutional_lead_id: lead?.id ?? null,
        from_email: fromEmail,
        raw_subject: body.subject ?? null,
        raw_body: body.body ?? null,
        received_at: body.receivedAt ?? new Date().toISOString(),
      })
      .select("id")
      .single()

    if (insertError) {
      console.error("reply-ingest: failed to insert reply_events row", insertError)
      return new Response(JSON.stringify({ error: "Failed to store reply" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    return new Response(JSON.stringify({ id: inserted.id, matchedLeadId: lead?.id ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    console.error("reply-ingest: unexpected error", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
