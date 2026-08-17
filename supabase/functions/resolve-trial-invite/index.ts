// Public, unauthenticated: the /trial/{code} landing page calls this to show the org
// name and validity of an invite code before sending the visitor to /register. Read-only
// — no side effects. The seat is actually claimed atomically inside handle_new_user() at
// signup time (see supabase/migrations/20260817190000_trial_grants.sql), not here, so a
// visit alone never consumes a seat.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => null)
    const code = typeof body?.code === "string" ? body.code.trim().slice(0, 40) : ""

    if (!code) {
      return new Response(JSON.stringify({ valid: false, error: "No invite code provided." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const { data, error } = await admin
      .from("trial_grants")
      .select("organization_name, feature_tier, status, expires_at, seat_count, seats_used")
      .eq("invite_code", code)
      .maybeSingle()

    if (error) {
      console.error("resolve-trial-invite: lookup failed", error)
      return new Response(JSON.stringify({ valid: false, error: "Could not check this invite link." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!data) {
      return new Response(JSON.stringify({ valid: false, error: "This invite link isn't recognized." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    const isExpired = new Date(data.expires_at).getTime() <= Date.now()
    const isFull = data.seats_used >= data.seat_count
    const isActive = data.status === "active"

    if (!isActive || isExpired || isFull) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: isFull
            ? "This invite link has reached its seat limit."
            : "This invite link has expired.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      )
    }

    return new Response(
      JSON.stringify({
        valid: true,
        organizationName: data.organization_name,
        featureTier: data.feature_tier,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return new Response(JSON.stringify({ valid: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }
})
