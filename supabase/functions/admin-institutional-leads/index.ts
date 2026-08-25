// Admin-only backend for /admin/institutional-leads: list/filter/search the B2B
// pipeline and manually override a lead's status. One file dispatched by `action`,
// matching the admin-trial-grants convention, since both only ever serve their own page.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Plain text column, no DB enum (see docs/db-schema-summary.md) - 'new'/'contacted' are
// set by the outbound scripts, 'bounced' by mailtrap-bounce-webhook. 'dead' is the only
// status that only ever gets set here, by an admin.
const VALID_STATUSES = new Set(["new", "contacted", "bounced", "dead"])

const LEAD_COLUMNS =
  "id, organization_name, category, source, status, opportunity_score, decision_maker_name, decision_maker_title, contact_email, campaign, last_send_error, created_at, updated_at"

interface RequestBody {
  action?: "list" | "update_status"
  search?: string
  source?: string
  category?: string
  status?: string
  hasContact?: boolean
  sortBy?: string
  sortAscending?: boolean
  limit?: number
  offset?: number
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

    const { data: isAdmin, error: adminError } = await userClient.rpc("current_user_has_role", {
      role_name: "admin",
    })

    if (adminError) {
      console.error("admin-institutional-leads: role check failed", adminError)
      return new Response(JSON.stringify({ error: "Failed to verify admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Only admins can access institutional leads" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    if (body.action === "update_status") {
      const leadId = body.leadId
      const status = body.status

      if (!leadId || !status) {
        return new Response(JSON.stringify({ error: "Missing leadId or status" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }
      if (!VALID_STATUSES.has(status)) {
        return new Response(JSON.stringify({ error: "Invalid status" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const { data: updated, error: updateError } = await serviceClient
        .from("institutional_leads")
        .update({ status })
        .eq("id", leadId)
        .select(LEAD_COLUMNS)
        .maybeSingle()

      if (updateError) {
        console.error("admin-institutional-leads: error updating lead", updateError)
        return new Response(JSON.stringify({ error: "Failed to update lead status" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      if (!updated) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        })
      }

      return new Response(JSON.stringify({ lead: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    // Default / "list" action
    const search = (body.search ?? "").trim()
    const source = (body.source ?? "").trim()
    const category = (body.category ?? "").trim()
    const status = (body.status ?? "").trim()
    const hasContact = body.hasContact
    const sortBy = body.sortBy === "opportunity_score" ? "opportunity_score" : "created_at"
    const sortAscending = body.sortAscending ?? false
    const limit = Math.min(Math.max(body.limit ?? 50, 1), 200)
    const offset = Math.max(body.offset ?? 0, 0)

    let leadsQuery = serviceClient
      .from("institutional_leads")
      .select(LEAD_COLUMNS, { count: "exact" })
      .order(sortBy, { ascending: sortAscending, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (search) {
      leadsQuery = leadsQuery.ilike("organization_name", `%${search}%`)
    }
    if (source) {
      leadsQuery = leadsQuery.eq("source", source)
    }
    if (category) {
      leadsQuery = leadsQuery.eq("category", category)
    }
    if (status) {
      leadsQuery = leadsQuery.eq("status", status)
    }
    if (hasContact === true) {
      leadsQuery = leadsQuery.not("contact_email", "is", null)
    } else if (hasContact === false) {
      leadsQuery = leadsQuery.is("contact_email", null)
    }

    const { data: leads, error: leadsError, count } = await leadsQuery

    if (leadsError) {
      console.error("admin-institutional-leads: error loading leads", leadsError)
      return new Response(JSON.stringify({ error: "Failed to load institutional leads" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    return new Response(
      JSON.stringify({
        leads: leads ?? [],
        total: count ?? (leads ?? []).length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    )
  } catch (error) {
    console.error("admin-institutional-leads: unexpected error", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
