// Receives Mailtrap Sending API webhook events (Settings -> Webhooks in the Mailtrap
// dashboard). bounce / spam / unsubscribe events write suppressed_emails for any address
// (not just outbound leads), and a bounce also flags a matching institutional_leads
// contact as 'bounced'. delivery / bounce / spam also update the matching email_events
// row by message_id (delivered / bounced / complained). Mailtrap sends batched POSTs
// (up to 500 events, every ~30s).
//
// Public endpoint (no user JWT): authenticity is the Mailtrap-Signature header, an
// HMAC-SHA256 of the raw body with the per-webhook signing secret. Requests with a
// missing/invalid signature are rejected before any DB write.
// Logic and tests: _shared/mailtrap-webhook.ts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { ilikeExact } from "../_shared/email-match.ts"
import { createMailtrapWebhookHandler } from "../_shared/mailtrap-webhook.ts"

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")

serve(createMailtrapWebhookHandler({
  secret: Deno.env.get("MAILTRAP_WEBHOOK_SECRET"),
  suppress: async ({ email, reason, scope, providerEventId }) => {
    const { error } = await admin.rpc("suppress_email", {
      p_email: email,
      p_reason: reason,
      p_scope: scope,
      p_source: "mailtrap-webhook",
      p_provider_event_id: providerEventId,
    })
    if (error) throw new Error(error.message)
  },
  flagBouncedLead: async (email) => {
    // PostgREST reads "*" in a pattern as a wildcard and offers no escape for it; such
    // addresses are vanishingly rare, so skip the lead flag rather than risk a broad match.
    if (email.includes("*")) return
    const { error } = await admin
      .from("institutional_leads")
      .update({ status: "bounced", updated_at: new Date().toISOString() })
      .ilike("contact_email", ilikeExact(email))
    if (error) throw new Error(error.message)
  },
  recordDelivery: async ({ messageId, status, at }) => {
    const { data, error } = await admin.rpc("record_email_delivery_event", {
      p_message_id: messageId,
      p_status: status,
      ...(at ? { p_at: at } : {}),
    })
    if (error) throw new Error(error.message)
    return typeof data === "number" ? data : 0
  },
}))
