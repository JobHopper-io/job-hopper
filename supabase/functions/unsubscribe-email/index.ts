import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { createUnsubscribeHandler } from "../_shared/unsubscribe-handler.ts"

// GET redirects to the SPA confirm page (/unsubscribe); POST (one-click or the confirm
// page) writes the unsubscribe. Logic and tests: _shared/unsubscribe-handler.ts.
const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")

serve(createUnsubscribeHandler({
  secret: Deno.env.get("UNSUBSCRIBE_EMAIL_SECRET"),
  siteUrl: Deno.env.get("SITE_URL") ?? "http://localhost:5173",
  applyUnsubscribe: async ({ email, profileId, scope }) => {
    const { data, error } = await supabase.rpc("apply_unsubscribe", {
      p_email: email,
      p_scope: scope,
      p_profile_id: profileId,
      p_source: "unsubscribe-email",
    })
    if (error) throw new Error(error.message)
    return data as string
  },
}))
