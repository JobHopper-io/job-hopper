// Admin-only backend for the /admin/trial-grants page: org picker (institutional_leads),
// grant listing, and grant creation. One file dispatched by `action` rather than three
// near-identical admin-auth-checked functions, since all three only ever serve that
// single admin page.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const VALID_TIERS = new Set(["free", "core", "premium"])

interface RequestBody {
  action?: "list_leads" | "list_grants" | "create_grant"
  organizationName?: string
  institutionalLeadId?: string | null
  seatCount?: number
  expiresAt?: string
  featureTier?: string
  inviteCode?: string
}

function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10)
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
    global: { headers: { Authorization: authHeader } },
  })
  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
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

    const [{ data: isAdmin, error: adminError }, { data: isSuperAdmin, error: superAdminError }] =
      await Promise.all([
        userClient.rpc("current_user_has_role", { role_name: "admin" }),
        userClient.rpc("current_user_has_role", { role_name: "super_admin" }),
      ])

    if (adminError || superAdminError) {
      console.error("admin-trial-grants: role check failed", adminError ?? superAdminError)
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

    if (body.action === "list_leads") {
      const { data, error } = await serviceClient
        .from("institutional_leads")
        .select("id, organization_name, category, status, created_at")
        .order("created_at", { ascending: false })
        .limit(500)

      if (error) {
        console.error("admin-trial-grants: failed to list leads", error)
        return new Response(JSON.stringify({ error: "Failed to load institutional leads" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      return new Response(JSON.stringify({ leads: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    if (body.action === "list_grants") {
      const { data, error } = await serviceClient
        .from("trial_grants")
        .select(
          "id, organization_name, institutional_lead_id, seat_count, seats_used, feature_tier, expires_at, invite_code, status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200)

      if (error) {
        console.error("admin-trial-grants: failed to list grants", error)
        return new Response(JSON.stringify({ error: "Failed to load trial grants" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      return new Response(JSON.stringify({ grants: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    if (body.action === "create_grant") {
      const organizationName = (body.organizationName ?? "").trim().slice(0, 200)
      const institutionalLeadId = body.institutionalLeadId || null
      const seatCount = Number(body.seatCount)
      const expiresAt = (body.expiresAt ?? "").trim()
      const featureTier = (body.featureTier ?? "").trim()
      const customCode = (body.inviteCode ?? "").trim().slice(0, 40)

      if (!organizationName) {
        return new Response(JSON.stringify({ error: "An organization name is required." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }
      if (!Number.isInteger(seatCount) || seatCount < 1) {
        return new Response(JSON.stringify({ error: "Seat count must be a positive integer." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }
      if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
        return new Response(JSON.stringify({ error: "A valid expiration date is required." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }
      if (Date.parse(expiresAt) <= Date.now()) {
        return new Response(JSON.stringify({ error: "Expiration must be in the future." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }
      if (!VALID_TIERS.has(featureTier)) {
        return new Response(JSON.stringify({ error: "Unrecognized feature tier." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const inviteCode = customCode || generateInviteCode()

      const { data, error } = await serviceClient
        .from("trial_grants")
        .insert({
          organization_name: organizationName,
          institutional_lead_id: institutionalLeadId,
          seat_count: seatCount,
          feature_tier: featureTier,
          expires_at: new Date(expiresAt).toISOString(),
          invite_code: inviteCode,
          created_by: user.id,
        })
        .select(
          "id, organization_name, institutional_lead_id, seat_count, seats_used, feature_tier, expires_at, invite_code, status, created_at",
        )
        .single()

      if (error) {
        const isConflict = (error as { code?: string }).code === "23505"
        console.error("admin-trial-grants: failed to create grant", error)
        return new Response(
          JSON.stringify({
            error: isConflict ? "That invite code is already in use." : "Failed to create trial grant.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: isConflict ? 409 : 500,
          },
        )
      }

      return new Response(JSON.stringify({ grant: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: "Unrecognized action." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  } catch (error) {
    console.error("admin-trial-grants: unexpected error", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
