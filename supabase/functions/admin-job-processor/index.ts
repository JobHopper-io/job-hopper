import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type Action = "health" | "createRun" | "getRun"

interface Body {
  action: Action
  options?: Record<string, unknown>
  runId?: string
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

  if (!supabaseUrl || !anonKey) {
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

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const action = body?.action
  if (action !== "health" && action !== "createRun" && action !== "getRun") {
    return new Response(JSON.stringify({ error: "Invalid action" }), {
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

    const { data: isSuperAdmin, error: superAdminError } = await userClient.rpc("current_user_has_role", {
      role_name: "super_admin",
    })

    if (superAdminError) {
      console.error("admin-job-processor: role check failed", superAdminError)
      return new Response(JSON.stringify({ error: "Failed to verify super_admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Only super_admin can manage the job processor" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    const baseUrl = Deno.env.get("JOB_PROCESSOR_URL")?.replace(/\/$/, "") ?? ""
    const apiKey = Deno.env.get("JOB_PROCESSOR_API_KEY") ?? ""

    if (!baseUrl || !apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "JOB_PROCESSOR_URL and JOB_PROCESSOR_API_KEY must be set as Edge Function secrets (Dashboard → Edge Functions → Secrets).",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      )
    }

    const processorHeaders: Record<string, string> = {
      "X-API-Key": apiKey,
    }

    if (action === "health") {
      const r = await fetch(`${baseUrl}/health`, { method: "GET", headers: processorHeaders })
      const text = await r.text()
      let payload: unknown = text
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = text
      }
      if (!r.ok) {
        return new Response(
          JSON.stringify({
            error: `Job processor health check failed (${r.status})`,
            upstream: payload,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 502,
          },
        )
      }
      return new Response(JSON.stringify({ health: payload }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    if (action === "createRun") {
      const opts = body.options && typeof body.options === "object" ? body.options : {}
      const r = await fetch(`${baseUrl}/v1/runs`, {
        method: "POST",
        headers: {
          ...processorHeaders,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(opts),
      })
      const text = await r.text()
      let payload: unknown
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        return new Response(
          JSON.stringify({ error: `Invalid JSON from job processor (${r.status})`, raw: text.slice(0, 500) }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 502,
          },
        )
      }
      if (!r.ok) {
        return new Response(
          JSON.stringify({
            error: typeof payload === "object" && payload !== null && "detail" in payload
              ? String((payload as { detail: unknown }).detail)
              : `Job processor returned ${r.status}`,
            upstream: payload,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: r.status,
          },
        )
      }
      return new Response(JSON.stringify({ createRun: payload }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    // getRun
    const runId = (body.runId ?? "").trim()
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRe.test(runId)) {
      return new Response(JSON.stringify({ error: "runId must be a valid UUID" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const r = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}`, {
      method: "GET",
      headers: {
        ...processorHeaders,
        Accept: "application/json",
      },
    })
    const text = await r.text()
    let payload: unknown
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      return new Response(
        JSON.stringify({ error: `Invalid JSON from job processor (${r.status})`, raw: text.slice(0, 500) }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 502,
        },
      )
    }
    if (!r.ok) {
      return new Response(
        JSON.stringify({
          error: typeof payload === "object" && payload !== null && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : `Job processor returned ${r.status}`,
          upstream: payload,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: r.status === 404 ? 404 : r.status >= 500 ? 502 : 400,
        },
      )
    }
    return new Response(JSON.stringify({ getRun: payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    console.error("admin-job-processor: unexpected error", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
