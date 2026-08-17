import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { sendSystemAnnouncement } from "../_shared/system-announcement-send.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let body: { announcement_id?: string }
  try {
    body = (await req.json()) as { announcement_id?: string }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const announcementId = body.announcement_id
  if (!announcementId || typeof announcementId !== "string") {
    return new Response(JSON.stringify({ error: "Missing or invalid announcement_id" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const result = await sendSystemAnnouncement(supabase, announcementId)

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: result.status,
    })
  }

  return new Response(
    JSON.stringify({
      announcement_id: announcementId,
      sent: result.sent,
      failed: result.failed,
      total_eligible: result.totalEligible,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
  )
})
