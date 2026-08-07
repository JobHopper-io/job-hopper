import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const VALID_STATUSES = new Set(["verified", "rejected", "suspended"])

interface ReviewEmployerRequest {
  employer_account_id?: string
  status?: string
  reason?: string
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
    global: {
      headers: { Authorization: authHeader },
    },
  })

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  let body: ReviewEmployerRequest
  try {
    body = (await req.json()) as ReviewEmployerRequest
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const employerAccountId = body.employer_account_id
  const status = body.status
  const reason = body.reason?.trim() || null

  if (!employerAccountId || !status) {
    return new Response(JSON.stringify({ error: "Missing employer_account_id or status" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  // 'pending' is signup-only (set by handle_new_user / verify-employer-account) - an admin
  // review always resolves an account to one of these three terminal-for-now states.
  if (!VALID_STATUSES.has(status)) {
    return new Response(JSON.stringify({ error: "Invalid status" }), {
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
      console.error("admin-review-employer: role check failed", adminError)
      return new Response(JSON.stringify({ error: "Failed to verify admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Only admins can review employer accounts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    const { data: callerProfile, error: callerProfileError } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()

    if (callerProfileError) {
      console.error("admin-review-employer: error loading caller profile", callerProfileError)
      return new Response(JSON.stringify({ error: "Failed to load caller profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!callerProfile) {
      console.error("admin-review-employer: caller profile not found")
      return new Response(JSON.stringify({ error: "Caller profile not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    const { data: updated, error: updateError } = await serviceClient
      .from("employer_accounts")
      .update({
        verification_status: status,
        reviewed_by: callerProfile.id,
        reviewed_at: new Date().toISOString(),
        review_reason: reason,
      })
      .eq("id", employerAccountId)
      .select("id, company_name, work_email, verification_status, reviewed_by, reviewed_at, review_reason")
      .maybeSingle()

    if (updateError) {
      console.error("admin-review-employer: error updating employer account", updateError)
      return new Response(JSON.stringify({ error: "Failed to update employer account" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!updated) {
      return new Response(JSON.stringify({ error: "Employer account not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      })
    }

    return new Response(JSON.stringify({ employer: updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    console.error("admin-review-employer: unexpected error", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
