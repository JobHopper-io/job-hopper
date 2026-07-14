import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface AssignRolesRequest {
  email?: string
  roles?: string[]
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

  let body: AssignRolesRequest
  try {
    body = (await req.json()) as AssignRoleRequest
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const email = body.email?.trim().toLowerCase()
  const desiredRoles = Array.from(
    new Set((body.roles ?? []).map((name) => name.trim().toLowerCase()).filter((name) => name.length > 0)),
  )

  if (!email || !body.roles) {
    return new Response(JSON.stringify({ error: "Missing email or roles" }), {
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

    const [{ data: isSuperAdmin, error: superAdminError }] = await Promise.all([
      userClient.rpc("current_user_has_role", { role_name: "super_admin" }),
    ])

    if (superAdminError) {
      console.error("assign-role: super_admin check failed", superAdminError)
      return new Response(JSON.stringify({ error: "Failed to verify super_admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Only super_admin can manage roles" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    const { data: callerProfile, error: callerProfileError } = await serviceClient
      .from("profiles")
      .select("id, auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle()

    if (callerProfileError) {
      console.error("assign-role: error loading caller profile", callerProfileError)
      return new Response(JSON.stringify({ error: "Failed to load caller profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!callerProfile) {
      console.error("assign-role: caller profile not found")
      return new Response(JSON.stringify({ error: "Caller profile not found" }), {
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

    // Prevent users from modifying their own permissions.
    if (callerProfile.id === profile.id) {
      return new Response(JSON.stringify({ error: "You cannot modify your own permissions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    // Enforce super_admin dependency on admin.
    if (desiredRoles.includes("super_admin") && !desiredRoles.includes("admin")) {
      return new Response(
        JSON.stringify({ error: "super_admin role requires admin to also be assigned" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      )
    }

    const { data: existingRoleRows, error: existingRolesError } = await serviceClient
      .from("profile_roles")
      .select("role_id, roles(name)")
      .eq("profile_id", profile.id)

    if (existingRolesError) {
      console.error("assign-role: error loading existing roles", existingRolesError)
      return new Response(JSON.stringify({ error: "Failed to load current roles" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    const currentRoles: string[] =
      (existingRoleRows ?? [])
        .map((row: { roles: { name: string } | null }) => row.roles?.name)
        .filter((name): name is string => typeof name === "string") ?? []

    const rolesToAdd = desiredRoles.filter((roleName) => !currentRoles.includes(roleName))
    const rolesToRemove = currentRoles.filter((roleName) => !desiredRoles.includes(roleName))

    const roleNamesToFetch = Array.from(new Set([...rolesToAdd, ...rolesToRemove]))

    const { data: roleDefinitions, error: rolesFetchError } = await serviceClient
      .from("roles")
      .select("id, name")
      .in("name", roleNamesToFetch)

    if (rolesFetchError) {
      console.error("assign-role: error loading role definitions", rolesFetchError)
      return new Response(JSON.stringify({ error: "Failed to load role definitions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    const roleIdByName = new Map<string, string>()
    for (const role of roleDefinitions ?? []) {
      roleIdByName.set(role.name as string, role.id as string)
    }

    const missingRoleNames = roleNamesToFetch.filter((name) => !roleIdByName.has(name))
    if (missingRoleNames.length > 0) {
      console.error("assign-role: unknown roles requested", missingRoleNames)
      return new Response(JSON.stringify({ error: "One or more requested roles do not exist" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const inserts =
      rolesToAdd.length > 0
        ? rolesToAdd.map((name) => ({
            profile_id: profile.id,
            role_id: roleIdByName.get(name) as string,
          }))
        : []

    if (inserts.length > 0) {
      const { error: insertError } = await serviceClient
        .from("profile_roles")
        .insert(inserts, { onConflict: "profile_id,role_id" })

      if (insertError) {
        console.error("assign-role: error inserting roles", insertError)
        return new Response(JSON.stringify({ error: "Failed to assign roles" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }
    }

    if (rolesToRemove.length > 0) {
      const roleIdsToRemove = rolesToRemove.map((name) => roleIdByName.get(name) as string)
      const { error: deleteError } = await serviceClient
        .from("profile_roles")
        .delete()
        .eq("profile_id", profile.id)
        .in("role_id", roleIdsToRemove)

      if (deleteError) {
        console.error("assign-role: error removing roles", deleteError)
        return new Response(JSON.stringify({ error: "Failed to remove roles" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }
    }

    const { data: roleRows, error: statusError } = await serviceClient
      .from("profile_roles")
      .select("roles(name)")
      .eq("profile_id", profile.id)

    if (statusError) {
      console.error("assign-role: status check failed", statusError)
      return new Response(JSON.stringify({ error: "Failed to read role status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    const roles: string[] =
      (roleRows ?? [])
        .map((row: { roles: { name: string } | null }) => row.roles?.name)
        .filter((name): name is string => typeof name === "string") ?? []

    return new Response(
      JSON.stringify({
        profile: {
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
        },
        roles,
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

