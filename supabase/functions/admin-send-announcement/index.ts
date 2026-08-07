import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { sendEmail } from "../_shared/email.ts"
import { wrapAnnouncementWithFooter } from "../_shared/email-templates.ts"
import { sendSystemAnnouncement } from "../_shared/system-announcement-send.ts"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEST_METADATA = { test_send: "true" as const }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Preview-only placeholder links - a dry run has no specific recipient to build a real
// signed unsubscribe token for. The real send (getFooterLinksForProfile, per recipient)
// replaces these with working links.
const PREVIEW_FOOTER = { preferencesUrl: "/profile", unsubscribeUrl: "#" }

interface SendAnnouncementRequest {
  title?: string
  email_subject?: string
  email_body_html?: string
  dry_run?: boolean
  test_email?: string
}

function slugify(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  const suffix = crypto.randomUUID().slice(0, 8)
  return `${base || "announcement"}-${suffix}`
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

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    })
  }

  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: {
      headers: { Authorization: authHeader },
    },
  })

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  let body: SendAnnouncementRequest
  try {
    body = (await req.json()) as SendAnnouncementRequest
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const title = body.title?.trim()
  const emailSubject = body.email_subject?.trim()
  const emailBodyHtml = body.email_body_html?.trim()

  if (!title || !emailSubject || !emailBodyHtml) {
    return new Response(
      JSON.stringify({ error: "title, email_subject, and email_body_html are all required" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    )
  }

  const testEmail = body.test_email?.trim()
  if (testEmail && !EMAIL_RE.test(testEmail)) {
    return new Response(JSON.stringify({ error: "test_email is not a valid email address" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      })
    }

    const { data: isAdmin, error: adminError } = await userClient.rpc("current_user_has_role", {
      role_name: "admin",
    })

    if (adminError) {
      console.error("admin-send-announcement: role check failed", adminError)
      return new Response(JSON.stringify({ error: "Failed to verify admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Only admins can send system announcements" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    // Dry run: render exactly what the real send will produce, write nothing, send nothing.
    if (body.dry_run) {
      return new Response(
        JSON.stringify({ html: wrapAnnouncementWithFooter(emailBodyHtml, PREVIEW_FOOTER) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    // Test send: the exact real-send HTML to exactly one address. No system_announcements
    // row, no touching the real recipient list - lets an admin see it land in an inbox
    // before firing the irreversible broadcast.
    if (testEmail) {
      const result = await sendEmail({
        to: testEmail,
        subject: emailSubject,
        html: wrapAnnouncementWithFooter(emailBodyHtml, PREVIEW_FOOTER),
        category: "test",
        metadata: TEST_METADATA,
        eventType: "system_announcement",
        templateKey: "system_announcement",
        payload: { test: true },
        supabase: serviceClient,
      })

      return new Response(
        JSON.stringify({ test_sent: result.success, error: result.error ?? null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    const { data: callerProfile, error: callerProfileError } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()

    if (callerProfileError) {
      console.error("admin-send-announcement: error loading caller profile", callerProfileError)
      return new Response(JSON.stringify({ error: "Failed to load caller profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!callerProfile) {
      console.error("admin-send-announcement: caller profile not found")
      return new Response(JSON.stringify({ error: "Caller profile not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    const { data: announcement, error: insertError } = await serviceClient
      .from("system_announcements")
      .insert({
        slug: slugify(title),
        title,
        email_subject: emailSubject,
        email_body_html: emailBodyHtml,
        published_at: new Date().toISOString(),
        created_by: callerProfile.id,
      })
      .select("id")
      .single()

    if (insertError || !announcement) {
      console.error("admin-send-announcement: error creating announcement", insertError)
      return new Response(JSON.stringify({ error: "Failed to create announcement" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    const result = await sendSystemAnnouncement(serviceClient, announcement.id)

    if (!result.ok) {
      // The row is already created and published; report the send failure rather than
      // pretending nothing happened - the admin needs to know it landed but didn't send.
      return new Response(JSON.stringify({ id: announcement.id, error: result.error }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: result.status,
      })
    }

    return new Response(
      JSON.stringify({
        id: announcement.id,
        sent: result.sent,
        failed: result.failed,
        total_eligible: result.totalEligible,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    )
  } catch (error) {
    console.error("admin-send-announcement: unexpected error", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
