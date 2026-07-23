import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MAX_URL_PATH_LENGTH = 500

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  // Public fire-and-forget beacon: always answer 200 { success: true }, even when the
  // input is bad or the RPC's own existence guard rejects it. This is a beacon called
  // with `keepalive`, nothing reads the response, and it shouldn't leak which url_path
  // values are valid to an unauthenticated caller.
  try {
    const body = await req.json().catch(() => null)
    const urlPath = typeof body?.url_path === "string" ? body.url_path.trim() : ""

    if (urlPath && urlPath.length <= MAX_URL_PATH_LENGTH) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } },
      )

      // increment_seo_page_view no-ops (does not insert) when url_path isn't a real
      // seo_pages row -- guards this public endpoint against inflating fake paths.
      const { error } = await admin.rpc("increment_seo_page_view", { p_url_path: urlPath })
      if (error) {
        console.error("log-seo-page-view: rpc failed", error)
      }
    }
  } catch (err) {
    console.error("log-seo-page-view:", err)
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  })
})
