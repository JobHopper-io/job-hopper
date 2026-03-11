import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const INVOCATION_TIMEOUT_MS = 60_000

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const authHeader = req.headers.get("Authorization") ?? ""

  if (!supabaseUrl || !anonKey) {
    return new Response(
      JSON.stringify({ error: "Server misconfiguration" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    )
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: { persistSession: false },
  })

  let processedProfiles = 0
  let matchInvocationsSucceeded = 0
  let matchInvocationsFailed = 0
  let nextRunAtIso: string | null = null

  // Always attempt to schedule the next run, even if part of the current run fails.
  try {

    // 1. Load all profiles that currently have at least one active subscription.
    type SubscriptionRow = {
      profile_id: string | null
    }

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("subscriptions")
      .select("profile_id")
      .in("status", ["trial", "active"])
      .not("profile_id", "is", null)

    if (subscriptionsError) {
      console.error("daily-job-matching: failed to load active subscriptions", {
        error: subscriptionsError.message,
      })
    } else {
      const profileIds = new Set<string>()

      for (const row of (subscriptions ?? []) as SubscriptionRow[]) {
        if (row.profile_id) {
          profileIds.add(row.profile_id)
        }
      }

      // 2. For each profile, call match-jobs with a random limit between 2 and 5.
      for (const profileId of profileIds) {
        processedProfiles += 1

        const limit = Math.floor(Math.random() * 4) + 2 // 2–5 inclusive

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), INVOCATION_TIMEOUT_MS)

        try {
          const url = `${supabaseUrl}/functions/v1/match-jobs`

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
            },
            body: JSON.stringify({
              profile_id: profileId,
              limit,
            }),
            signal: controller.signal,
          })

          clearTimeout(timeoutId)

          if (response.ok) {
            matchInvocationsSucceeded += 1
          } else {
            matchInvocationsFailed += 1
            const errorBody = await response.text().catch(() => "")
            console.error("daily-job-matching: match-jobs returned non-2xx", {
              status: response.status,
              statusText: response.statusText,
              body: errorBody,
              profileId,
              limit,
            })
          }
        } catch (err) {
          clearTimeout(timeoutId)
          matchInvocationsFailed += 1

          if (err instanceof Error && err.name === "AbortError") {
            console.error("daily-job-matching: match-jobs invocation timed out", {
              profileId,
              limit,
            })
          } else {
            console.error("daily-job-matching: match-jobs invocation error", {
              profileId,
              limit,
              message: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
    }

    // 3. Compute a random time tomorrow (UTC) for the next run.
    const now = new Date()
    const tomorrowStartUtc = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0,
        0,
      ),
    )

    const dayInMs = 24 * 60 * 60 * 1000
    const randomOffsetMs = Math.floor(Math.random() * dayInMs)
    const nextRunAt = new Date(tomorrowStartUtc.getTime() + randomOffsetMs)
    nextRunAtIso = nextRunAt.toISOString()
  } finally {
    // 4. Always attempt to schedule the next run, even if the above logic failed partway through.
    try {
      if (!nextRunAtIso) {
        const now = new Date()
        const tomorrowStartUtc = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
            0,
            0,
            0,
            0,
          ),
        )
        const dayInMs = 24 * 60 * 60 * 1000
        const randomOffsetMs = Math.floor(Math.random() * dayInMs)
        nextRunAtIso = new Date(tomorrowStartUtc.getTime() + randomOffsetMs).toISOString()
      }

      const { error: scheduleError } = await supabase
        .from("scheduled_jobs")
        .insert({
          function_name: "daily-job-matching",
          payload: {},
          run_at: nextRunAtIso,
        })

      if (scheduleError) {
        console.error("daily-job-matching: failed to schedule next run", {
          error: scheduleError.message,
          nextRunAtIso,
        })
      }
    } catch (err) {
      console.error("daily-job-matching: unexpected error while scheduling next run", {
        message: err instanceof Error ? err.message : String(err),
        nextRunAtIso,
      })
    }
  }

  return new Response(
    JSON.stringify({
      processed_profiles: processedProfiles,
      match_invocations_succeeded: matchInvocationsSucceeded,
      match_invocations_failed: matchInvocationsFailed,
      next_run_at: nextRunAtIso,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    },
  )
})

