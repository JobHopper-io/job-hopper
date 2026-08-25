// Admin-only backend for B2C Revenue-Recovery Segments (Build 14): computes the 7
// buildable segments (see _shared/revenue-recovery-segments.ts for which of the plan's
// 9 have a real signal and which don't) and sends the matching real re-engagement
// email via the existing sendEmail/Mailtrap infrastructure, respecting the same
// email_unsubscribed_at suppression every other real B2C send in this app already
// honors (see _shared/system-announcement-send.ts).
//
// send_segment_email requires EITHER testEmailOverride (send the one segment's copy to
// a single address only -- no segment members touched, no suppression list needed) OR
// confirmRealSend: true (send to every real, non-unsubscribed member of the segment).
// This mirrors outbound-live-send.mjs's --campaign requirement for a real send: a
// deliberate, explicit flag, not something a routine list_segments call could trigger
// by accident.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { sendEmail } from "../_shared/email.ts"
import { getFooterLinksForProfile } from "../_shared/unsubscribe-token.ts"
import { wrapAnnouncementWithFooter } from "../_shared/email-templates.ts"
import { buildSegmentCopy, plainTextToHtml } from "../_shared/revenue-recovery-copy.ts"
import {
  highMatchCountThreshold,
  isActivatedNeverPaid,
  isCancelled,
  isHeavyFreeUsage,
  isHighMatchUser,
  isNeverActivated,
  isNoLogin30d,
  isVisaFocusedNoConversion,
  subscriptionFlagsFromStatuses,
  type RevenueRecoverySegmentKey,
} from "../_shared/revenue-recovery-segments.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SEGMENT_KEYS: RevenueRecoverySegmentKey[] = [
  "never_activated",
  "activated_never_paid",
  "cancelled",
  "no_login_30d",
  "heavy_free_usage",
  "high_match_users",
  "visa_focused_no_conversion",
]

const SEGMENT_LABELS: Record<RevenueRecoverySegmentKey, string> = {
  never_activated: "Signed up, never activated",
  activated_never_paid: "Activated, never paid",
  cancelled: "Cancelled",
  no_login_30d: "No login in 30+ days",
  heavy_free_usage: "Heavy free usage",
  high_match_users: "High-match users",
  visa_focused_no_conversion: "Visa/sponsorship-focused, not converted",
}

interface RequestBody {
  action?: "list_segments" | "send_segment_email"
  segment?: string
  testEmailOverride?: string
  confirmRealSend?: boolean
}

interface ProfileRow {
  id: string
  email: string
  first_name: string | null
  onboarding_completed: boolean | null
  requires_us_sponsorship: boolean | null
  created_at: string
  auth_user_id: string | null
}

interface SegmentMember {
  profileId: string
  email: string
  firstName: string
  detail: string
}

async function loadSegmentSources(serviceClient: ReturnType<typeof createClient>) {
  const profiles: ProfileRow[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await serviceClient
      .from("profiles")
      .select("id, email, first_name, onboarding_completed, requires_us_sponsorship, created_at, auth_user_id")
      .range(offset, offset + 999)
    if (error) throw new Error(`Failed to load profiles: ${error.message}`)
    profiles.push(...((data ?? []) as ProfileRow[]))
    if (!data || data.length < 1000) break
    offset += 1000
  }

  const statusesByProfile = new Map<string, string[]>()
  let subOffset = 0
  for (;;) {
    const { data, error } = await serviceClient.from("subscriptions").select("profile_id, status").range(subOffset, subOffset + 999)
    if (error) throw new Error(`Failed to load subscriptions: ${error.message}`)
    for (const row of data ?? []) {
      const list = statusesByProfile.get(row.profile_id as string)
      if (list) list.push(row.status as string)
      else statusesByProfile.set(row.profile_id as string, [row.status as string])
    }
    if (!data || data.length < 1000) break
    subOffset += 1000
  }

  const { data: freemiumRows, error: freemiumError } = await serviceClient
    .from("freemium_usage")
    .select("profile_id, job_searches_used")
  if (freemiumError) throw new Error(`Failed to load freemium_usage: ${freemiumError.message}`)
  const jobSearchesByProfile = new Map<string, number>((freemiumRows ?? []).map((r) => [r.profile_id as string, r.job_searches_used as number]))

  const { data: settings, error: settingsError } = await serviceClient
    .from("freemium_settings")
    .select("max_job_searches")
    .eq("id", 1)
    .maybeSingle()
  if (settingsError) throw new Error(`Failed to load freemium_settings: ${settingsError.message}`)
  const maxJobSearches = settings?.max_job_searches ?? 3

  const matchCountByProfile = new Map<string, number>()
  let matchOffset = 0
  for (;;) {
    const { data, error } = await serviceClient.from("job_matches").select("profile_id").range(matchOffset, matchOffset + 999)
    if (error) throw new Error(`Failed to load job_matches: ${error.message}`)
    for (const row of data ?? []) {
      const pid = row.profile_id as string
      matchCountByProfile.set(pid, (matchCountByProfile.get(pid) ?? 0) + 1)
    }
    if (!data || data.length < 1000) break
    matchOffset += 1000
  }

  // last_sign_in_at only exists on auth.users -- bulk-fetch per real (non-null
  // auth_user_id) profile, same approach admin-partner-dashboard already uses at
  // smaller scale.
  const lastSignInByProfile = new Map<string, string | null>()
  const withAuthUser = profiles.filter((p) => p.auth_user_id)
  const results = await Promise.all(withAuthUser.map((p) => serviceClient.auth.admin.getUserById(p.auth_user_id!)))
  results.forEach((r, i) => {
    lastSignInByProfile.set(withAuthUser[i].id, r.data.user?.last_sign_in_at ?? null)
  })

  return { profiles, statusesByProfile, jobSearchesByProfile, maxJobSearches, matchCountByProfile, lastSignInByProfile }
}

function computeSegments(sources: Awaited<ReturnType<typeof loadSegmentSources>>): Record<RevenueRecoverySegmentKey, SegmentMember[]> {
  const { profiles, statusesByProfile, jobSearchesByProfile, maxJobSearches, matchCountByProfile, lastSignInByProfile } = sources
  const now = Date.now()
  const result: Record<RevenueRecoverySegmentKey, SegmentMember[]> = {
    never_activated: [], activated_never_paid: [], cancelled: [], no_login_30d: [],
    heavy_free_usage: [], high_match_users: [], visa_focused_no_conversion: [],
  }

  const matchThreshold = highMatchCountThreshold([...matchCountByProfile.values()])

  for (const p of profiles) {
    if (!p.email) continue
    const flags = subscriptionFlagsFromStatuses(statusesByProfile.get(p.id) ?? [])
    const name = p.first_name || "there"

    if (isNeverActivated({ onboardingCompleted: p.onboarding_completed, createdAt: p.created_at, hasAuthUser: !!p.auth_user_id }, now)) {
      const ageDays = Math.floor((now - new Date(p.created_at).getTime()) / 86400000)
      result.never_activated.push({ profileId: p.id, email: p.email, firstName: name, detail: `signed up ${ageDays}d ago` })
    }
    if (isActivatedNeverPaid(p.onboarding_completed, flags)) {
      result.activated_never_paid.push({ profileId: p.id, email: p.email, firstName: name, detail: "no subscription" })
    }
    if (isCancelled(flags)) {
      result.cancelled.push({ profileId: p.id, email: p.email, firstName: name, detail: "canceled" })
    }
    const lastSignInAt = lastSignInByProfile.get(p.id) ?? null
    if (isNoLogin30d(lastSignInAt, now, flags)) {
      const days = lastSignInAt ? Math.floor((now - new Date(lastSignInAt).getTime()) / 86400000) : null
      result.no_login_30d.push({ profileId: p.id, email: p.email, firstName: name, detail: `last login ${days}d ago` })
    }
    const jobSearchesUsed = jobSearchesByProfile.get(p.id) ?? 0
    if (isHeavyFreeUsage(jobSearchesUsed, maxJobSearches, flags)) {
      result.heavy_free_usage.push({ profileId: p.id, email: p.email, firstName: name, detail: `${jobSearchesUsed}/${maxJobSearches} free searches used` })
    }
    const matchCount = matchCountByProfile.get(p.id) ?? 0
    if (isHighMatchUser(matchCount, matchThreshold, flags)) {
      result.high_match_users.push({ profileId: p.id, email: p.email, firstName: name, detail: `${matchCount} matches` })
    }
    if (isVisaFocusedNoConversion(p.requires_us_sponsorship, flags)) {
      result.visa_focused_no_conversion.push({ profileId: p.id, email: p.email, firstName: name, detail: "requires sponsorship" })
    }
  }

  return result
}

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

    if (body.action === "list_segments") {
      const sources = await loadSegmentSources(serviceClient)
      const segments = computeSegments(sources)
      const summary = SEGMENT_KEYS.map((key) => ({ key, label: SEGMENT_LABELS[key], count: segments[key].length }))
      return new Response(JSON.stringify({ summary, segments, totalProfiles: sources.profiles.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      })
    }

    if (body.action === "send_segment_email") {
      const segment = body.segment as RevenueRecoverySegmentKey
      if (!SEGMENT_KEYS.includes(segment)) {
        return new Response(JSON.stringify({ error: "Unrecognized segment." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        })
      }

      const siteUrl = Deno.env.get("SITE_URL") || "https://job-hopper.io"

      // Test path: one address, one send, no segment members touched, no suppression
      // list needed -- for verifying the copy/render/send path without contacting any
      // real account holder.
      if (body.testEmailOverride) {
        const copy = buildSegmentCopy(segment, { recipientName: "there", siteUrl, matchCount: 42 })
        const result = await sendEmail({
          to: body.testEmailOverride,
          subject: `[TEST] ${copy.subject}`,
          html: wrapAnnouncementWithFooter(plainTextToHtml(copy.body), { preferencesUrl: `${siteUrl}/profile`, unsubscribeUrl: `${siteUrl}/profile?unsubscribe=1` }),
          text: copy.body,
          category: "revenue_recovery_test",
        })
        return new Response(JSON.stringify({ success: result.success, error: result.error ?? null, messageId: result.messageId, mode: "test" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
        })
      }

      if (!body.confirmRealSend) {
        return new Response(
          JSON.stringify({ error: "Real segment sends require confirmRealSend: true, or pass testEmailOverride to test the copy/send path against one address." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        )
      }

      const sources = await loadSegmentSources(serviceClient)
      const segments = computeSegments(sources)
      const members = segments[segment]

      // Suppression: same email_unsubscribed_at gate every other real B2C send in this
      // app already honors (see _shared/system-announcement-send.ts).
      const { data: unsubRows, error: unsubError } = await serviceClient
        .from("notification_settings")
        .select("profile_id")
        .not("email_unsubscribed_at", "is", null)
      if (unsubError) throw new Error(`Failed to load suppression list: ${unsubError.message}`)
      const unsubscribed = new Set((unsubRows ?? []).map((r) => r.profile_id as string))

      let sent = 0
      let suppressed = 0
      let failed = 0
      for (const member of members) {
        if (unsubscribed.has(member.profileId)) {
          suppressed += 1
          continue
        }
        const footer = await getFooterLinksForProfile(member.profileId)
        const matchCount = sources.matchCountByProfile.get(member.profileId)
        const copy = buildSegmentCopy(segment, { recipientName: member.firstName, siteUrl: footer.siteUrl, matchCount })
        const result = await sendEmail({
          to: member.email,
          subject: copy.subject,
          html: wrapAnnouncementWithFooter(plainTextToHtml(copy.body), footer),
          text: copy.body,
          category: "revenue_recovery",
          profileId: member.profileId,
          eventType: "system_announcement",
          templateKey: `revenue_recovery_${segment}`,
          payload: { segment },
          supabase: serviceClient,
        })
        if (result.success) sent += 1
        else failed += 1
      }

      return new Response(JSON.stringify({ segment, totalEligible: members.length, sent, suppressed, failed, mode: "real" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      })
    }

    return new Response(JSON.stringify({ error: "Unrecognized action." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    })
  } catch (error) {
    console.error("admin-revenue-recovery-segments: unexpected error", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    })
  }
})
