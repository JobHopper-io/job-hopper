import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { sendEmail } from "../_shared/email.ts"
import { wrapAnnouncementWithFooter } from "../_shared/email-templates.ts"
import { getFooterLinksForProfile } from "../_shared/unsubscribe-token.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const BATCH_SIZE = 100

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

  const { data: announcement, error: annError } = await supabase
    .from("system_announcements")
    .select("id, email_subject, email_body_html, published_at")
    .eq("id", announcementId)
    .single()

  if (annError || !announcement) {
    return new Response(JSON.stringify({ error: "Announcement not found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 404,
    })
  }

  if (!announcement.published_at) {
    return new Response(JSON.stringify({ error: "Announcement is not published" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  // Profiles that are allowed to receive system announcements (not unsubscribed, opted in).
  const { data: settingsRows, error: settingsError } = await supabase
    .from("notification_settings")
    .select("profile_id")
    .is("email_unsubscribed_at", null)
    .eq("system_announcements_email_enabled", true)

  if (settingsError) {
    console.error("send-system-announcement: failed to load notification_settings", settingsError)
    return new Response(JSON.stringify({ error: "Failed to load recipients" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }

  const profileIds = (settingsRows ?? []).map((r) => r.profile_id)
  if (profileIds.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, message: "No eligible recipients" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", profileIds)

  const batch = (profiles ?? []).filter((p) => p.email).slice(0, BATCH_SIZE)

  let sent = 0
  let failed = 0
  for (const profile of batch) {
    try {
      const footer = await getFooterLinksForProfile(profile.id)
      const fullHtml = wrapAnnouncementWithFooter(announcement.email_body_html, {
        preferencesUrl: footer.preferencesUrl,
        unsubscribeUrl: footer.unsubscribeUrl,
      })
      const result = await sendEmail({
        to: profile.email,
        subject: announcement.email_subject,
        html: fullHtml,
        profileId: profile.id,
        eventType: "system_announcement",
        templateKey: "system_announcement",
        payload: { announcement_id: announcementId },
        supabase,
      })
      if (result.success) sent++
      else failed++
    } catch {
      failed++
    }
  }

  return new Response(
    JSON.stringify({
      announcement_id: announcementId,
      sent,
      failed,
      total_eligible: profileIds.length,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  )
})
