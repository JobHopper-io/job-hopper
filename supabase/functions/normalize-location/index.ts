import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { normalizeLocationInput } from "../_shared/location-normalization.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      },
    )
  }

  try {
    const body = await req.json()
    const input = typeof body?.input === "string" ? body.input : ""
    const result = normalizeLocationInput(input)

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    )
  } catch (error) {
    console.error("normalize-location error:", error)
    return new Response(
      JSON.stringify({ normalized: null, error: "Unable to normalize location. Please try again." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    )
  }
})

