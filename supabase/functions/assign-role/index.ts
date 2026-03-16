import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface AssignRoleRequest {
  email?: string
  role?: string
  action?: "status" | "grant" | "revoke"
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
    global: {
      headers: { Authorization: authHeader },
    },
  })

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  let body: AssignRoleRequest
  try {
    body = (await req.json()) as AssignRoleRequest
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const email = body.email?.trim().toLowerCase()
  const roleName = body.role ?? "admin"
  const action: AssignRoleRequest["action"] = body.action ?? "status"

  if (!email || !action) {
    return new Response(JSON.stringify({ error: "Missing email or action" }), {
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

    const { data: isAdmin, error: adminCheckError } = await userClient.rpc("current_user_has_role", {
      role_name: "admin",
    })

    if (adminCheckError) {
      console.error("assign-role: admin check failed", adminCheckError)
      return new Response(JSON.stringify({ error: "Failed to verify admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, email, first_name, last_name")
      .ilike("email", email)
      .maybeSingle()

    if (profileError) {
      console.error("assign-role: error loading profile", profileError)
      return new Response(JSON.stringify({ error: "Failed to load profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      })
    }

    const { data: roleRow, error: roleError } = await serviceClient
      .from("roles")
      .select("id, name")
      .eq("name", roleName)
      .maybeSingle()

    if (roleError || !roleRow) {
      console.error("assign-role: role not found", roleError)
      return new Response(JSON.stringify({ error: "Role not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    if (action === "grant") {
      const { error: upsertError } = await serviceClient
        .from("profile_roles")
        .insert({ profile_id: profile.id, role_id: roleRow.id }, { onConflict: "profile_id,role_id" })

      if (upsertError) {
        console.error("assign-role: error granting role", upsertError)
        return new Response(JSON.stringify({ error: "Failed to grant role" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }
    }

    if (action === "revoke") {
      const { error: deleteError } = await serviceClient
        .from("profile_roles")
        .delete()
        .eq("profile_id", profile.id)
        .eq("role_id", roleRow.id)

      if (deleteError) {
        console.error("assign-role: error revoking role", deleteError)
        return new Response(JSON.stringify({ error: "Failed to revoke role" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }
    }

    const { data: hasRole, error: statusError } = await serviceClient
      .from("profile_roles")
      .select("profile_id")
      .eq("profile_id", profile.id)
      .eq("role_id", roleRow.id)
      .maybeSingle()

    if (statusError) {
      console.error("assign-role: status check failed", statusError)
      return new Response(JSON.stringify({ error: "Failed to read role status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    const isNowAdmin = !!hasRole

    return new Response(
      JSON.stringify({
        profile: {
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
        },
        isAdmin: isNowAdmin,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    )
  } catch (error) {
    console.error("assign-role: unexpected error", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})

