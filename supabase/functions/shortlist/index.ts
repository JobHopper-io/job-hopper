import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { createShortlistHandler, type StoredShortlist } from "../_shared/shortlist-handler.ts"

// Public: /s/:token reads a shortlist here, and Apply clicks redirect through /click.
// The token is the credential; logic and tests in _shared/shortlist-handler.ts.
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } })

serve(createShortlistHandler({
  functionUrl: `${supabaseUrl}/functions/v1/shortlist`,
  async findByToken(token) {
    const { data, error } = await db
      .from("prospect_shortlists")
      .select("id, status, jobs, expires_at, first_viewed_at")
      .eq("token", token)
      .maybeSingle()
    if (error) throw new Error(`prospect_shortlists: ${error.message}`)
    return data as StoredShortlist | null
  },
  async latestVacancy(jobIds) {
    const latest = new Map<string, string>()
    if (!jobIds.length) return latest
    const { data, error } = await db
      .from("job_vacancy_checks")
      .select("job_id, status, checked_at")
      .in("job_id", jobIds)
      .order("checked_at", { ascending: false })
    if (error) throw new Error(`job_vacancy_checks: ${error.message}`)
    for (const r of data ?? []) if (!latest.has(r.job_id)) latest.set(r.job_id, r.status)
    return latest
  },
  async logEvent(shortlistId, event, jobId) {
    const { error } = await db.from("shortlist_events").insert({ shortlist_id: shortlistId, event, job_id: jobId })
    if (error) console.error("shortlist: event not logged", error.message)
  },
  async markFirstViewed(shortlistId, at) {
    const { error } = await db
      .from("prospect_shortlists")
      .update({ first_viewed_at: at.toISOString() })
      .eq("id", shortlistId)
      .is("first_viewed_at", null)
    if (error) console.error("shortlist: first view not recorded", error.message)
  },
}))
