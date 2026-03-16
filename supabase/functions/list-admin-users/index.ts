import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface ListUsersRequest {
  search?: string
  limit?: number
  offset?: number
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

  let body: ListUsersRequest
  try {
    body = (await req.json()) as ListUsersRequest
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const search = (body.search ?? "").trim()
  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200)
  const offset = Math.max(body.offset ?? 0, 0)

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
      console.error("list-admin-users: admin check failed", adminCheckError)
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

    let profilesQuery = serviceClient
      .from("profiles")
      .select("id, email, first_name, last_name", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      profilesQuery = profilesQuery.ilike("email", `%${search}%`)
    }

    const { data: profiles, error: profilesError, count } = await profilesQuery

    if (profilesError) {
      console.error("list-admin-users: error loading profiles", profilesError)
      return new Response(JSON.stringify({ error: "Failed to load profiles" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    const profileIds = (profiles ?? []).map((p) => p.id as string)

    let rolesByProfile = new Map<string, string[]>()

    if (profileIds.length > 0) {
      const { data: roleRows, error: rolesError } = await serviceClient
        .from("profile_roles")
        .select("profile_id, roles(name)")
        .in("profile_id", profileIds)

      if (rolesError) {
        console.error("list-admin-users: error loading roles", rolesError)
        return new Response(JSON.stringify({ error: "Failed to load roles" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      for (const row of roleRows ?? []) {
        const profileId = row.profile_id as string
        const roleName = row.roles?.name as string | undefined
        if (!roleName) continue
        if (!rolesByProfile.has(profileId)) {
          rolesByProfile.set(profileId, [])
        }
        rolesByProfile.get(profileId)!.push(roleName)
      }
    }

    const result = (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      first_name: p.first_name,
      last_name: p.last_name,
      roles: rolesByProfile.get(p.id as string) ?? [],
    }))

    return new Response(
      JSON.stringify({
        profiles: result,
        total: count ?? result.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    )
  } catch (error) {
    console.error("list-admin-users: unexpected error", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})

