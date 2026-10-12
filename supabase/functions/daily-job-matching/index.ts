import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { isServiceCall } from "../_shared/cron-auth.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const PAGE_SIZE = 1000
// Per-profile match-jobs rows are spread over this window so each 15-minute
// run-scheduled-jobs tick picks up only a few.
// ponytail: run-scheduled-jobs drains 25 rows per tick sequentially (~2,400/day); past
// that, rows queue into later ticks — raise PER_RUN_LIMIT or run rows concurrently.
const SPREAD_WINDOW_MS = 6 * 60 * 60 * 1000

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  })
}

function randomTimeTomorrowUtc(): string {
  const now = new Date()
  const tomorrowStartUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return new Date(tomorrowStartUtc + Math.floor(Math.random() * 24 * 60 * 60 * 1000)).toISOString()
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  // Each call enqueues matching (and digest emails) for every subscriber, so only the
  // scheduler may trigger it — the anon key passes the gateway's verify_jwt.
  if (!isServiceCall(req)) {
    return json({ error: "Unauthorized" }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server misconfiguration" }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // 1. Enqueue the next run FIRST, so the daily chain survives even if this run dies.
  //    A unique index allows one pending chain row; 23505 means it is already scheduled.
  const nextRunAtIso = randomTimeTomorrowUtc()
  const { error: scheduleError } = await supabase
    .from("scheduled_jobs")
    .insert({ function_name: "daily-job-matching", payload: {}, run_at: nextRunAtIso })

  if (scheduleError && scheduleError.code !== "23505") {
    console.error("daily-job-matching: failed to schedule next run", {
      error: scheduleError.message,
      nextRunAtIso,
    })
  }

  // 2. Every profile with a trial/active subscription, paginated past PostgREST's row cap.
  const profileIds = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("profile_id")
      .in("status", ["trial", "active"])
      .not("profile_id", "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error("daily-job-matching: failed to load active subscriptions", { error: error.message })
      return json({ error: "Failed to load subscriptions" }, 500)
    }

    for (const row of data ?? []) {
      if (row.profile_id) profileIds.add(row.profile_id)
    }
    if (!data || data.length < PAGE_SIZE) break
  }

  // 3. Fan out: one match-jobs row per profile (random limit 2–5), executed by
  //    run-scheduled-jobs, instead of looping over every profile in this invocation.
  const now = Date.now()
  const rows = [...profileIds].map((profileId) => ({
    function_name: "match-jobs",
    payload: { profile_id: profileId, limit: Math.floor(Math.random() * 4) + 2 },
    run_at: new Date(now + Math.floor(Math.random() * SPREAD_WINDOW_MS)).toISOString(),
  }))

  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    const { error } = await supabase.from("scheduled_jobs").insert(rows.slice(i, i + PAGE_SIZE))
    if (error) {
      console.error("daily-job-matching: failed to enqueue match-jobs rows", { error: error.message })
      return json({ error: "Failed to enqueue matching" }, 500)
    }
  }

  return json({ enqueued_profiles: rows.length, next_run_at: nextRunAtIso }, 200)
})
