// Receives Mailtrap Sending API webhook events (Settings -> Webhooks in the Mailtrap
// dashboard) and flags institutional_leads whose contact_email hard-bounced, so that
// lead is never silently retried as if it had been delivered. Section 0 confirmed
// Mailtrap sends this natively (POST, batched, up to 500 events per delivery, every
// ~30s) -- no polling or parallel tracking infra needed.
//
// Public endpoint (Mailtrap calls it directly, no user JWT) -- authenticity is
// verified via the Mailtrap-Signature header instead: HMAC-SHA256 of the raw request
// body using the per-webhook signing secret Mailtrap generates when the webhook is
// created in the dashboard. Requests with a missing/invalid signature are rejected
// before any DB write. See docs.mailtrap.io/email-api-smtp/advanced/webhooks.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mailtrap-signature",
}

interface MailtrapEvent {
  event?: string
  email?: string
  message_id?: string
  bounce_category?: string
}

async function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader) return false
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody))
  const computed = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  // Constant-time comparison -- signatureHeader is attacker-controlled input.
  if (computed.length !== signatureHeader.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ signatureHeader.charCodeAt(i)
  }
  return diff === 0
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

  const webhookSecret = Deno.env.get("MAILTRAP_WEBHOOK_SECRET")
  if (!webhookSecret) {
    console.error("mailtrap-bounce-webhook: MAILTRAP_WEBHOOK_SECRET is not configured; rejecting")
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    })
  }

  const rawBody = await req.text()
  const signature = req.headers.get("Mailtrap-Signature")
  const valid = await verifySignature(rawBody, signature, webhookSecret)
  if (!valid) {
    console.error("mailtrap-bounce-webhook: invalid or missing signature")
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    })
  }

  let body: { events?: MailtrapEvent[] }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const events = Array.isArray(body.events) ? body.events : []
  // "bounce" is Mailtrap's permanent-failure event; soft_bounce (temporary) is
  // deliberately not treated as a dead address here -- only a hard bounce should
  // stop a lead from ever being retried.
  const bouncedEmails = [
    ...new Set(
      events
        .filter((e) => e.event === "bounce" && typeof e.email === "string" && e.email.trim())
        .map((e) => e.email!.trim().toLowerCase()),
    ),
  ]

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )

  for (const email of bouncedEmails) {
    const { error } = await admin
      .from("institutional_leads")
      .update({ status: "bounced", updated_at: new Date().toISOString() })
      .ilike("contact_email", email)

    if (error) {
      console.error("mailtrap-bounce-webhook: failed to flag bounced lead", { email, error })
    }
  }

  // Always 200 once the payload is verified and parsed -- Mailtrap retries a non-200
  // up to 40 times over several hours, which would just re-run the same update against
  // rows that may already be flagged; a DB write failure here is logged, not retried.
  return new Response(JSON.stringify({ received: events.length, bounced: bouncedEmails.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  })
})
