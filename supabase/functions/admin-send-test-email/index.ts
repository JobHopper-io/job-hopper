import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendEmail } from "../_shared/email.ts"
import {
  renderJobMatchDigest,
  renderSubscriptionCanceled,
  renderSubscriptionCancelScheduled,
  renderSubscriptionStarted,
  renderSubscriptionUpdated,
  wrapAnnouncementWithFooter,
  type JobSummary,
} from "../_shared/email-templates.ts"
import { getFooterLinksForProfile } from "../_shared/unsubscribe-token.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const TEST_METADATA = { test_send: "true" as const }

export type AdminTestEmailKind =
  | "job_match_digest"
  | "subscription_started"
  | "subscription_updated"
  | "subscription_cancel_scheduled"
  | "subscription_canceled"
  | "system_announcement"

interface AdminSendTestEmailBody {
  profile_id?: string
  email?: string
  kind?: AdminTestEmailKind
  job_ids?: string[]
  plan_name?: string
  next_billing_date?: string
  cancel_at_date?: string
  announcement_id?: string
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
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

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  let body: AdminSendTestEmailBody
  try {
    body = (await req.json()) as AdminSendTestEmailBody
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const kind = body.kind
  const validKinds: AdminTestEmailKind[] = [
    "job_match_digest",
    "subscription_started",
    "subscription_updated",
    "subscription_cancel_scheduled",
    "subscription_canceled",
    "system_announcement",
  ]

  if (!kind || !validKinds.includes(kind)) {
    return new Response(JSON.stringify({ error: "Missing or invalid kind" }), {
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

    const [{ data: isAdmin, error: adminCheckError }, { data: isSuperAdmin, error: superAdminError }] =
      await Promise.all([
        userClient.rpc("current_user_has_role", { role_name: "admin" }),
        userClient.rpc("current_user_has_role", { role_name: "super_admin" }),
      ])

    if (adminCheckError || superAdminError) {
      console.error("admin-send-test-email: role check failed", adminCheckError ?? superAdminError)
      return new Response(JSON.stringify({ error: "Failed to verify admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    const profileIdRaw = typeof body.profile_id === "string" ? body.profile_id.trim() : ""
    const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""

    if ((profileIdRaw && emailRaw) || (!profileIdRaw && !emailRaw)) {
      return new Response(JSON.stringify({ error: "Provide exactly one of profile_id or email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    let profile: { id: string; email: string; first_name: string | null }
    if (profileIdRaw) {
      const { data: row, error: profileError } = await serviceClient
        .from("profiles")
        .select("id, email, first_name")
        .eq("id", profileIdRaw)
        .maybeSingle()

      if (profileError || !row?.email) {
        return new Response(JSON.stringify({ error: "Profile not found or has no email" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        })
      }
      profile = { id: row.id, email: row.email, first_name: row.first_name }
    } else {
      const { data: row, error: profileError } = await serviceClient
        .from("profiles")
        .select("id, email, first_name")
        .eq("email", emailRaw)
        .maybeSingle()

      if (profileError || !row?.email) {
        return new Response(JSON.stringify({ error: "No profile found for that email" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        })
      }
      profile = { id: row.id, email: row.email, first_name: row.first_name }
    }

    const footer = await getFooterLinksForProfile(profile.id)
    const recipientName = profile.first_name?.trim() || "there"

    if (kind === "job_match_digest") {
      const rawIds = Array.isArray(body.job_ids) ? body.job_ids : []
      const jobIds = rawIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id.length > 0)

      if (jobIds.length === 0) {
        return new Response(JSON.stringify({ error: "job_match_digest requires at least one job id in job_ids" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const { data: jobRows, error: jobsError } = await serviceClient
        .from("job_hopper_live")
        .select(
          "id, job_title, company_name, location, description, ai_job_briefing, apply_link",
        )
        .in("id", jobIds.slice(0, 15))

      if (jobsError) {
        console.error("admin-send-test-email: failed to load jobs", jobsError)
        return new Response(JSON.stringify({ error: "Failed to load jobs" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      const byId = new Map((jobRows ?? []).map((r) => [r.id as string, r]))
      const jobs: JobSummary[] = []
      for (const jid of jobIds.slice(0, 15)) {
        const row = byId.get(jid)
        if (!row) continue
        jobs.push({
          id: row.id as string,
          title: row.job_title ?? null,
          companyName: row.company_name ?? null,
          location: row.location ?? null,
          description: row.description ?? null,
          aiBriefing: row.ai_job_briefing ?? null,
          applyLink: row.apply_link ?? null,
        })
      }

      if (jobs.length === 0) {
        return new Response(JSON.stringify({ error: "None of the given job ids were found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const { html, text } = renderJobMatchDigest({
        recipientName,
        jobs,
        dashboardUrl: `${footer.siteUrl}/dashboard`,
        footer: {
          preferencesUrl: footer.preferencesUrl,
          unsubscribeUrl: footer.unsubscribeUrl,
        },
      })

      const result = await sendEmail({
        to: profile.email,
        subject: "Your new Job-Hopper matches",
        html,
        text,
        category: "test",
        metadata: TEST_METADATA,
        eventType: "job_match_digest",
        templateKey: "job_match_digest_default",
        profileId: profile.id,
        payload: { job_count: jobs.length, test: true },
        supabase: serviceClient,
      })

      return new Response(
        JSON.stringify({
          success: result.success,
          message_id: result.messageId,
          error: result.error ?? null,
          kind,
          profile_id: profile.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    if (kind === "subscription_started") {
      const { html, text } = renderSubscriptionStarted({
        recipientName,
        footer: { preferencesUrl: footer.preferencesUrl, unsubscribeUrl: footer.unsubscribeUrl },
      })
      const result = await sendEmail({
        to: profile.email,
        subject: "Welcome to Job-Hopper",
        html,
        text,
        category: "test",
        metadata: TEST_METADATA,
        profileId: profile.id,
        eventType: "subscription_update",
        templateKey: "subscription_started",
        payload: { test: true },
        supabase: serviceClient,
      })
      return new Response(
        JSON.stringify({
          success: result.success,
          message_id: result.messageId,
          error: result.error ?? null,
          kind,
          profile_id: profile.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    if (kind === "subscription_updated") {
      const planName = typeof body.plan_name === "string" ? body.plan_name.trim() || undefined : undefined
      const nextBillingDate =
        typeof body.next_billing_date === "string" ? body.next_billing_date.trim() || undefined : undefined
      const { html, text } = renderSubscriptionUpdated({
        recipientName,
        planName,
        nextBillingDate,
        footer: { preferencesUrl: footer.preferencesUrl, unsubscribeUrl: footer.unsubscribeUrl },
      })
      const result = await sendEmail({
        to: profile.email,
        subject: "Your Job-Hopper subscription was updated",
        html,
        text,
        category: "test",
        metadata: TEST_METADATA,
        profileId: profile.id,
        eventType: "subscription_update",
        templateKey: "subscription_updated",
        payload: { planName, nextBillingDate, test: true },
        supabase: serviceClient,
      })
      return new Response(
        JSON.stringify({
          success: result.success,
          message_id: result.messageId,
          error: result.error ?? null,
          kind,
          profile_id: profile.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    if (kind === "subscription_cancel_scheduled") {
      const cancelAtDate =
        typeof body.cancel_at_date === "string" ? body.cancel_at_date.trim() || undefined : undefined
      const { html, text } = renderSubscriptionCancelScheduled({
        recipientName,
        cancelAtDate,
        footer: { preferencesUrl: footer.preferencesUrl, unsubscribeUrl: footer.unsubscribeUrl },
      })
      const result = await sendEmail({
        to: profile.email,
        subject: "Your Job-Hopper subscription will be canceled",
        html,
        text,
        category: "test",
        metadata: TEST_METADATA,
        profileId: profile.id,
        eventType: "subscription_update",
        templateKey: "subscription_cancel_scheduled",
        payload: { cancelAtDate, test: true },
        supabase: serviceClient,
      })
      return new Response(
        JSON.stringify({
          success: result.success,
          message_id: result.messageId,
          error: result.error ?? null,
          kind,
          profile_id: profile.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    if (kind === "subscription_canceled") {
      const { html, text } = renderSubscriptionCanceled({
        recipientName,
        footer: { preferencesUrl: footer.preferencesUrl, unsubscribeUrl: footer.unsubscribeUrl },
      })
      const result = await sendEmail({
        to: profile.email,
        subject: "Your Job-Hopper subscription was canceled",
        html,
        text,
        category: "test",
        metadata: TEST_METADATA,
        profileId: profile.id,
        eventType: "subscription_update",
        templateKey: "subscription_canceled",
        payload: { test: true },
        supabase: serviceClient,
      })
      return new Response(
        JSON.stringify({
          success: result.success,
          message_id: result.messageId,
          error: result.error ?? null,
          kind,
          profile_id: profile.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    // system_announcement
    const announcementId = typeof body.announcement_id === "string" ? body.announcement_id.trim() : ""
    if (!announcementId) {
      return new Response(JSON.stringify({ error: "system_announcement requires announcement_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const { data: announcement, error: annError } = await serviceClient
      .from("system_announcements")
      .select("id, email_subject, email_body_html")
      .eq("id", announcementId)
      .maybeSingle()

    if (annError || !announcement) {
      return new Response(JSON.stringify({ error: "Announcement not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      })
    }

    const fullHtml = wrapAnnouncementWithFooter(announcement.email_body_html, {
      preferencesUrl: footer.preferencesUrl,
      unsubscribeUrl: footer.unsubscribeUrl,
    })

    const result = await sendEmail({
      to: profile.email,
      subject: announcement.email_subject,
      html: fullHtml,
      category: "test",
      metadata: TEST_METADATA,
      profileId: profile.id,
      eventType: "system_announcement",
      templateKey: "system_announcement",
      payload: { announcement_id: announcementId, test: true },
      supabase: serviceClient,
    })

    return new Response(
      JSON.stringify({
        success: result.success,
        message_id: result.messageId,
        error: result.error ?? null,
        kind,
        profile_id: profile.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("admin-send-test-email:", error)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
