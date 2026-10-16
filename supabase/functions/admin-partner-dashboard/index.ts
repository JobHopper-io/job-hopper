// Admin-only backend for /admin/partner-dashboard/:leadId: the seat records (trial grants,
// org account, seat invites) for one institutional_leads row. Activity analytics come
// from the partner-portal function (partner_insights), shared with the university view.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

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

    const { data: orgAccount, error: orgAccountError } = await serviceClient
      .from("org_accounts")
      .select("id, organization_name, feature_tier, seat_count, seats_used, status, subscription_id, created_at")
      .eq("institutional_lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (orgAccountError) {
      console.error("admin-partner-dashboard: error loading org account", orgAccountError)
      return new Response(JSON.stringify({ error: "Failed to load org account" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    let seatInvites: { email: string; invited_at: string; claimed: boolean; revoked_at: string | null }[] = []
    if (orgAccount) {
      const { data: invites, error: invitesError } = await serviceClient
        .from("org_seat_invites")
        .select("email, invited_at, claimed, revoked_at")
        .eq("org_account_id", orgAccount.id)
        .order("invited_at", { ascending: false })

      if (invitesError) {
        console.error("admin-partner-dashboard: error loading seat invites", invitesError)
        return new Response(JSON.stringify({ error: "Failed to load seat invites" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }
      seatInvites = invites ?? []
    }

    return new Response(
      JSON.stringify({ lead, grants: grants ?? [], orgAccount, seatInvites }),
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
