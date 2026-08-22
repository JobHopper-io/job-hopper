// Admin-only backend for /admin/partner-dashboard/:leadId: aggregated, org-scoped
// activity metrics for anyone linked to one institutional_leads row - via a trial_grant
// created for that org, or via the best-effort referred_by_institutional_lead_id signup
// link (see docs/db-schema-summary.md). Counts and totals only, never per-user rows -
// the plan is explicit that this must never expose an individual user's job search
// activity to an org contact.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// "Active" is a real signal (auth.users.last_sign_in_at via the admin API), not a
// tracked column - no existing table stores last-activity, so this is the honest proxy.
const ACTIVE_WINDOW_DAYS = 30

interface RequestBody {
  leadId?: string
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

  // apikey uses the service-role key (not anon) so the PostgREST `current_user_has_role`
  // RPC call succeeds; Authorization still forwards the caller's own JWT, so auth.uid()
  // inside that function resolves to the caller, not an elevated identity.
  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const leadId = (body.leadId ?? "").trim()
  if (!leadId) {
    return new Response(JSON.stringify({ error: "Missing leadId" }), {
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
      console.error("admin-partner-dashboard: role check failed", adminError)
      return new Response(JSON.stringify({ error: "Failed to verify admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Only admins can view the partner dashboard" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    const { data: lead, error: leadError } = await serviceClient
      .from("institutional_leads")
      .select("id, organization_name, category, status")
      .eq("id", leadId)
      .maybeSingle()

    if (leadError) {
      console.error("admin-partner-dashboard: error loading lead", leadError)
      return new Response(JSON.stringify({ error: "Failed to load institutional lead" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!lead) {
      return new Response(JSON.stringify({ error: "Institutional lead not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      })
    }

    const { data: grants, error: grantsError } = await serviceClient
      .from("trial_grants")
      .select("id, seat_count, seats_used, feature_tier, expires_at, status, invite_code")
      .eq("institutional_lead_id", leadId)
      .order("created_at", { ascending: false })

    if (grantsError) {
      console.error("admin-partner-dashboard: error loading trial grants", grantsError)
      return new Response(JSON.stringify({ error: "Failed to load trial grants" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    const grantIds = (grants ?? []).map((g) => g.id)

    // Union of both linkage paths (see file header): a profile can match either, so
    // fetch both sets and dedupe by profile id rather than trying one combined filter.
    const linkedProfiles = new Map<string, { id: string; auth_user_id: string | null; resume_bucket_key: string | null }>()

    if (grantIds.length > 0) {
      const { data: byGrant, error: byGrantError } = await serviceClient
        .from("profiles")
        .select("id, auth_user_id, resume_bucket_key")
        .in("trial_grant_id", grantIds)

      if (byGrantError) {
        console.error("admin-partner-dashboard: error loading profiles by grant", byGrantError)
        return new Response(JSON.stringify({ error: "Failed to load linked users" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }
      for (const p of byGrant ?? []) linkedProfiles.set(p.id, p)
    }

    const { data: byReferral, error: byReferralError } = await serviceClient
      .from("profiles")
      .select("id, auth_user_id, resume_bucket_key")
      .eq("referred_by_institutional_lead_id", leadId)

    if (byReferralError) {
      console.error("admin-partner-dashboard: error loading profiles by referral", byReferralError)
      return new Response(JSON.stringify({ error: "Failed to load linked users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }
    for (const p of byReferral ?? []) linkedProfiles.set(p.id, p)

    const profileIds = Array.from(linkedProfiles.keys())

    // Nothing linked yet - the realistic case for every org right now. Skip the
    // remaining queries entirely rather than returning misleading zeroed placeholders
    // from queries that were never actually run.
    if (profileIds.length === 0) {
      return new Response(
        JSON.stringify({
          lead,
          grants: grants ?? [],
          metrics: {
            linkedUserCount: 0,
            activeUserCount: 0,
            resumeUploads: 0,
            jobMatches: 0,
            applications: 0,
          },
          activeWindowDays: ACTIVE_WINDOW_DAYS,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    const resumeUploads = Array.from(linkedProfiles.values()).filter((p) => !!p.resume_bucket_key).length

    const [{ count: jobMatchesCount, error: jobMatchesError }, { count: applicationsCount, error: applicationsError }] =
      await Promise.all([
        serviceClient
          .from("job_matches")
          .select("id", { count: "exact", head: true })
          .in("profile_id", profileIds),
        serviceClient
          .from("job_applications")
          .select("id", { count: "exact", head: true })
          .in("profile_id", profileIds),
      ])

    if (jobMatchesError || applicationsError) {
      console.error("admin-partner-dashboard: error counting activity", jobMatchesError ?? applicationsError)
      return new Response(JSON.stringify({ error: "Failed to load activity metrics" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    // last_sign_in_at only exists on auth.users, not profiles - fetched per linked user
    // via the admin API. Fine at the scale a single org's linked accounts run at; this
    // is not a global report.
    const activeCutoff = Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const authUserIds = Array.from(linkedProfiles.values())
      .map((p) => p.auth_user_id)
      .filter((id): id is string => !!id)

    const signInResults = await Promise.all(
      authUserIds.map((authUserId) => serviceClient.auth.admin.getUserById(authUserId)),
    )

    let activeUserCount = 0
    for (const result of signInResults) {
      const lastSignInAt = result.data.user?.last_sign_in_at
      if (lastSignInAt && new Date(lastSignInAt).getTime() >= activeCutoff) {
        activeUserCount += 1
      }
    }

    return new Response(
      JSON.stringify({
        lead,
        grants: grants ?? [],
        metrics: {
          linkedUserCount: profileIds.length,
          activeUserCount,
          resumeUploads,
          jobMatches: jobMatchesCount ?? 0,
          applications: applicationsCount ?? 0,
        },
        activeWindowDays: ACTIVE_WINDOW_DAYS,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    )
  } catch (error) {
    console.error("admin-partner-dashboard: unexpected error", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
