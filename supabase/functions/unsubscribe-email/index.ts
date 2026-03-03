import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:5173"

interface UnsubscribePayload {
  profile_id: string
  scope: string
  exp: number
}

function decodeBase64Url(value: string): Uint8Array {
  let base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  while (base64.length % 4 !== 0) {
    base64 += "="
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function verifyToken(token: string, secret: string): Promise<UnsubscribePayload | null> {
  const dot = token.indexOf(".")
  if (dot === -1) return null
  const payloadB64 = token.slice(0, dot)
  const sigB64 = token.slice(dot + 1)
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
  const sigBytes = decodeBase64Url(sigB64)
  const sigValid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(payloadB64)
  )
  if (!sigValid) return null
  try {
    const decoded = decodeBase64Url(payloadB64)
    const payload = JSON.parse(new TextDecoder().decode(decoded)) as UnsubscribePayload
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    if (!payload.profile_id || typeof payload.profile_id !== "string") return null
    return payload
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const token = url.searchParams.get("token")

  if (!token) {
    return Response.redirect(`${SITE_URL}/profile?unsubscribe=error`, 302)
  }

  const secret = Deno.env.get("UNSUBSCRIBE_EMAIL_SECRET")
  if (!secret) {
    console.error("unsubscribe-email: UNSUBSCRIBE_EMAIL_SECRET not set")
    return Response.redirect(`${SITE_URL}/profile?unsubscribe=error`, 302)
  }

  const payload = await verifyToken(token, secret)
  if (!payload) {
    return Response.redirect(`${SITE_URL}/profile?unsubscribe=invalid`, 302)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.redirect(`${SITE_URL}/profile?unsubscribe=error`, 302)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const now = new Date().toISOString()
  const { error } = await supabase
    .from("notification_settings")
    .upsert(
      {
        profile_id: payload.profile_id,
        email_unsubscribed_at: now,
        updated_at: now,
      },
      { onConflict: "profile_id" }
    )

  if (error) {
    console.error("unsubscribe-email: update failed", error)
    return Response.redirect(`${SITE_URL}/profile?unsubscribe=error`, 302)
  }

  return Response.redirect(`${SITE_URL}/unsubscribe-success`, 302)
})
