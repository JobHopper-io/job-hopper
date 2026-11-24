// Admin backend for B2C recovery sequences. Uses the same runner and rules as the daily
// recovery-sequences job (_shared/recovery-sequences.ts), so a manual send obeys the same
// 7-day limit, no-repeat rule, pre-send checks and per-run cap.
//
//   preview    who would get which email next (masked emails); reads only
//   send       one run in send mode; requires confirmRealSend: true
//   test_send  one segment/stage's copy to testEmailOverride only; no member touched,
//              nothing logged to email_events or followup_sequences
//   outreach   outreach sequences (leads and prospects): stage, next due, stopped and
//              why; reads only
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { sendEmail } from "../_shared/email.ts"
import { getFooterLinksForProfile } from "../_shared/unsubscribe-token.ts"
import { createRecoveryDeps, loadGrowthSettings } from "../_shared/recovery-deps.ts"
import { recoverySendOptions, runRecovery } from "../_shared/recovery-sequences.ts"
import { createOutreachDeps, loadOutreachSettings } from "../_shared/outreach-deps.ts"
import { summarizeOutreach } from "../_shared/outreach-sequences.ts"
import {
  RECOVERY_SEGMENT_PRIORITY,
  type RecoveryCandidate,
  type RevenueRecoverySegmentKey,
  SEGMENT_LABELS,
} from "../_shared/revenue-recovery-segments.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface RequestBody {
  action?: "preview" | "send" | "test_send" | "outreach"
  segment?: string
  stage?: number
  testEmailOverride?: string
  confirmRealSend?: boolean
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status })

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 405,
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    })
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
    })
  }

  const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    })
  }

  try {
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      })
    }

    const [{ data: isAdmin, error: adminError }, { data: isSuperAdmin, error: superAdminError }] = await Promise.all([
      userClient.rpc("current_user_has_role", { role_name: "admin" }),
      userClient.rpc("current_user_has_role", { role_name: "super_admin" }),
    ])
    if (adminError || superAdminError) {
      return new Response(JSON.stringify({ error: "Failed to verify admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      })
    }
    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403,
      })
    }

    if (body.action === "outreach") {
      const [outreachSettings, sequences] = await Promise.all([
        loadOutreachSettings(serviceClient),
        createOutreachDeps(serviceClient, Deno.env).loadSequences(),
      ])
      return json({
        settings: { autoSend: outreachSettings.outreach_auto_send, maxPerRun: outreachSettings.outreach_max_per_run },
        sequences: summarizeOutreach(sequences),
      })
    }

    const settings = await loadGrowthSettings(serviceClient)
    const settingsView = {
      autoSend: settings.recovery_auto_send,
      maxSendsPerRun: settings.recovery_max_sends_per_run,
      offerSegments: Object.keys(settings.recovery_offers ?? {}),
    }
    const segments = RECOVERY_SEGMENT_PRIORITY.map((key) => ({ key, label: SEGMENT_LABELS[key] }))

    if (body.action === "preview") {
      const result = await runRecovery({ mode: "preview", maxSends: settings.recovery_max_sends_per_run, now: new Date() }, createRecoveryDeps(serviceClient, settings))
      return json({ settings: settingsView, segments, result })
    }

    if (body.action === "send") {
      if (body.confirmRealSend !== true) {
        return json({ error: "Real sends require confirmRealSend: true." }, 400)
      }
      const result = await runRecovery({ mode: "send", maxSends: settings.recovery_max_sends_per_run, now: new Date() }, createRecoveryDeps(serviceClient, settings))
      return json({ settings: settingsView, segments, result })
    }

    if (body.action === "test_send") {
      const segment = body.segment as RevenueRecoverySegmentKey
      const stage = body.stage === 2 ? 2 : 1
      if (!RECOVERY_SEGMENT_PRIORITY.includes(segment)) return json({ error: "Unrecognized segment." }, 400)
      if (!body.testEmailOverride) return json({ error: "testEmailOverride is required." }, 400)
      // Placeholder person; a real signed footer for the test address.
      const sample: RecoveryCandidate = {
        profile_id: "test", email: body.testEmailOverride, first_name: null, target_job_title: null,
        created_at: new Date().toISOString(), email_confirmed: true, onboarding_completed: true, has_resume: false,
        requires_us_sponsorship: null, last_seen_at: null, has_any_sub: false, has_canceled_sub: false,
        job_searches_used: 3, max_job_searches: 3, abandoned_checkout_at: null, abandoned_checkout_proxy: false,
      }
      const footer = await getFooterLinksForProfile(null, body.testEmailOverride, "marketing")
      const options = recoverySendOptions({ candidate: sample, segment, stage, footer, offer: settings.recovery_offers?.[segment] ?? null })
      const result = await sendEmail({ ...options, subject: `[TEST] ${options.subject}`, profileId: null, category: "recovery_test" })
      return json({ success: result.success, error: result.error ?? null, messageId: result.messageId, mode: "test" })
    }

    return json({ error: "Unrecognized action." }, 400)
  } catch (error) {
    console.error("admin-revenue-recovery-segments: unexpected error", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return json({ error: message }, 500)
  }
})
