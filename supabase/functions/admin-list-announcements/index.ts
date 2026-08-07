import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const LIMIT = 100

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
    global: {
      headers: { Authorization: authHeader },
    },
  })

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

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
      console.error("admin-list-announcements: role check failed", adminError)
      return new Response(JSON.stringify({ error: "Failed to verify admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Only admins can view announcement history" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    const { data: announcements, error: listError } = await serviceClient
      .from("system_announcements")
      .select("id, title, email_subject, published_at, created_by")
      .order("published_at", { ascending: false })
      .limit(LIMIT)

    if (listError) {
      console.error("admin-list-announcements: error loading announcements", listError)
      return new Response(JSON.stringify({ error: "Failed to load announcements" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    const creatorIds = Array.from(
      new Set((announcements ?? []).map((a) => a.created_by as string | null).filter((id): id is string => !!id)),
    )

    const creatorById = new Map<string, { first_name: string; last_name: string | null; email: string }>()
    if (creatorIds.length > 0) {
      const { data: creators, error: creatorsError } = await serviceClient
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", creatorIds)

      if (creatorsError) {
        console.error("admin-list-announcements: error loading creator profiles", creatorsError)
        return new Response(JSON.stringify({ error: "Failed to load announcements" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      for (const creator of creators ?? []) {
        creatorById.set(creator.id as string, {
          first_name: creator.first_name as string,
          last_name: creator.last_name as string | null,
          email: creator.email as string,
        })
      }
    }

    const result = (announcements ?? []).map((a) => {
      const creator = a.created_by ? creatorById.get(a.created_by as string) : undefined
      return {
        id: a.id,
        title: a.title,
        email_subject: a.email_subject,
        published_at: a.published_at,
        sent_by: creator ? `${creator.first_name} ${creator.last_name ?? ""}`.trim() || creator.email : null,
      }
    })

    return new Response(JSON.stringify({ announcements: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    console.error("admin-list-announcements: unexpected error", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
