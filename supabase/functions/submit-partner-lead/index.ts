// Public, unauthenticated: the B2C-side twin of the outbound institutional-lead
// pipeline (scripts/college-scorecard-connector.mjs, warn-connector.mjs,
// career-partner-connector.mjs). Someone landing on a partner page (organically, or via
// a forwarded outbound email) becomes an institutional_leads row the same way a WARN or
// Scorecard pull does — same table, same upsert-by-(organization_name, source) shape.
//
// institutional_leads has RLS enabled with no anon/authenticated policies (same as
// premium_waitlist), so this write can only happen server-side with the service role.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The live category vocabulary for institutional_leads (see docs/db-schema-summary.md).
// 'workforce_org' is new as of the /workforce partner page — workforce organizations
// aren't students, employers, or career-service businesses, so none of the existing
// three values fit; no DB constraint enforces this list (category is plain text), so
// this Set is the only place it's validated.
const VALID_CATEGORIES = new Set(["university", "employer", "career_partner", "workforce_org"])

function clean(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => null)

    const organizationName = clean(body?.organizationName, 200)
    const category = clean(body?.category, 50)
    const email = clean(body?.email, 320).toLowerCase()
    const name = clean(body?.name, 200)
    const title = clean(body?.title, 200)

    if (!organizationName) {
      return new Response(
        JSON.stringify({ error: "An organization name is required." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      )
    }
    if (!email || !EMAIL_RE.test(email)) {
      return new Response(
        JSON.stringify({ error: "A valid email address is required." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      )
    }
    if (!VALID_CATEGORIES.has(category)) {
      return new Response(
        JSON.stringify({ error: "Unrecognized partner category." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      )
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    // A fresh inbound form-fill is a real re-engagement signal even for an org we
    // already have a (possibly stale/cold) row for — status resets to 'new' so it
    // surfaces again for outreach follow-up, same reasoning as the build spec.
    const { error } = await admin
      .from("institutional_leads")
      .upsert(
        {
          organization_name: organizationName,
          category,
          contact_email: email,
          decision_maker_name: name || null,
          decision_maker_title: title || null,
          source: "landing_page_form",
          status: "new",
        },
        { onConflict: "organization_name,source" },
      )

    if (error) {
      console.error("Failed to upsert institutional_leads row:", error)
      return new Response(
        JSON.stringify({ error: "Could not submit your request. Please try again." }),
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
