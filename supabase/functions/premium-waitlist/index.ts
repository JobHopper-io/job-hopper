import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Basic sanity check; the real gate is that this only captures interest, not auth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => null)
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""

    if (!email || !EMAIL_RE.test(email) || email.length > 320) {
      return new Response(
        JSON.stringify({ error: "A valid email address is required." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      )
    }

    // Service-role client for the insert (premium_waitlist has no anon/authenticated
    // INSERT policy). RLS is bypassed by the service role key.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    // If the caller is a logged-in user, attach their profile_id. The client value is
    // never trusted -- we resolve it from the JWT so a logged-out capture stays null.
    let profileId: string | null = null
    const authHeader = req.headers.get("Authorization")
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } },
      )
      const {
        data: { user },
      } = await userClient.auth.getUser()
      if (user) {
        const { data: profile } = await admin
          .from("profiles")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle()
        if (profile?.id) profileId = profile.id as string
      }
    }

    const { error } = await admin
      .from("premium_waitlist")
      .insert({ email, profile_id: profileId })

    if (error) {
      console.error("Failed to insert premium_waitlist row:", error)
      return new Response(
        JSON.stringify({ error: "Could not join the waitlist. Please try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    )
  }
})
