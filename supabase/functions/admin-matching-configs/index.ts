import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import type { MatchingAlgorithmConfigRow } from "../_shared/db-row-types.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type Action = "list" | "create" | "update" | "activate"

interface AdminMatchingConfigsRequest {
  action?: Action
  id?: string
  name?: string
  makeActive?: boolean
  config?: {
    keywordWeights?: {
      currentJobTitleKeyword?: number
      currentIndustryKeyword?: number
    }
    payWeights?: {
      insideRange?: number
      nearRange?: number
      missingSalary?: number
      belowRangePenalty?: number
    }
    locationWeights?: {
      sameMetro?: number
      sameState?: number
      remotePreferred?: number
      relocationAllowed?: number
      otherLocationPenalty?: number
      distance0to10?: number
      distance10to25?: number
      distance25to50?: number
      distance50to100?: number
      distanceBeyond100?: number
      withinRadiusBonus?: number
    }
    recencyWeights?: {
      baseRecency?: number
      perDayDecay?: number
      maxAgeDays?: number
    }
    thresholds?: {
      minTotalScore?: number
      noKeywordMatchPenalty?: number
      overPayTolerancePct?: number
      underPayTolerancePct?: number
    }
  }
}

function overrideToDbColumns(input: NonNullable<AdminMatchingConfigsRequest["config"]>) {
  const cols: Record<string, number | null | boolean | string> = {}

  const kw = input.keywordWeights ?? {}
  if (kw.currentJobTitleKeyword != null) cols.keyword_current_job_title_weight = kw.currentJobTitleKeyword
  if (kw.currentIndustryKeyword != null) cols.keyword_current_industry_weight = kw.currentIndustryKeyword

  const pay = input.payWeights ?? {}
  if (pay.insideRange != null) cols.pay_inside_range_weight = pay.insideRange
  if (pay.nearRange != null) cols.pay_near_range_weight = pay.nearRange
  if (pay.missingSalary != null) cols.pay_missing_salary_weight = pay.missingSalary
  if (pay.belowRangePenalty != null) cols.pay_below_range_penalty = pay.belowRangePenalty

  const loc = input.locationWeights ?? {}
  if (loc.sameMetro != null) cols.loc_same_metro_weight = loc.sameMetro
  if (loc.sameState != null) cols.loc_same_state_weight = loc.sameState
  if (loc.remotePreferred != null) cols.loc_remote_preferred_weight = loc.remotePreferred
  if (loc.relocationAllowed != null) cols.loc_relocation_allowed_weight = loc.relocationAllowed
  if (loc.otherLocationPenalty != null) cols.loc_other_location_penalty = loc.otherLocationPenalty
  if (loc.distance0to10 != null) cols.loc_distance_0_10_weight = loc.distance0to10
  if (loc.distance10to25 != null) cols.loc_distance_10_25_weight = loc.distance10to25
  if (loc.distance25to50 != null) cols.loc_distance_25_50_weight = loc.distance25to50
  if (loc.distance50to100 != null) cols.loc_distance_50_100_weight = loc.distance50to100
  if (loc.distanceBeyond100 != null) cols.loc_distance_beyond_100_weight = loc.distanceBeyond100
  if (loc.withinRadiusBonus != null) cols.loc_within_radius_bonus_weight = loc.withinRadiusBonus

  const rec = input.recencyWeights ?? {}
  if (rec.baseRecency != null) cols.recency_base_weight = rec.baseRecency
  if (rec.perDayDecay != null) cols.recency_per_day_decay = rec.perDayDecay
  if (rec.maxAgeDays != null) cols.recency_max_age_days = rec.maxAgeDays

  const th = input.thresholds ?? {}
  if (th.minTotalScore != null) cols.threshold_min_total_score = th.minTotalScore
  if (th.noKeywordMatchPenalty != null) cols.threshold_no_keyword_match_penalty = th.noKeywordMatchPenalty
  if (th.overPayTolerancePct != null) cols.threshold_over_pay_tolerance_pct = th.overPayTolerancePct
  if (th.underPayTolerancePct != null) cols.threshold_under_pay_tolerance_pct = th.underPayTolerancePct

  return cols
}

function rowToConfig(row: MatchingAlgorithmConfigRow) {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    config: {
      keywordWeights: {
        currentJobTitleKeyword: row.keyword_current_job_title_weight,
        currentIndustryKeyword: row.keyword_current_industry_weight,
      },
      payWeights: {
        insideRange: row.pay_inside_range_weight,
        nearRange: row.pay_near_range_weight,
        missingSalary: row.pay_missing_salary_weight,
        belowRangePenalty: row.pay_below_range_penalty,
      },
      locationWeights: {
        sameMetro: row.loc_same_metro_weight,
        sameState: row.loc_same_state_weight,
        remotePreferred: row.loc_remote_preferred_weight,
        relocationAllowed: row.loc_relocation_allowed_weight,
        otherLocationPenalty: row.loc_other_location_penalty,
        distance0to10: row.loc_distance_0_10_weight,
        distance10to25: row.loc_distance_10_25_weight,
        distance25to50: row.loc_distance_25_50_weight,
        distance50to100: row.loc_distance_50_100_weight,
        distanceBeyond100: row.loc_distance_beyond_100_weight,
        withinRadiusBonus: row.loc_within_radius_bonus_weight,
      },
      recencyWeights: {
        baseRecency: row.recency_base_weight,
        perDayDecay: row.recency_per_day_decay,
        maxAgeDays: row.recency_max_age_days,
      },
      thresholds: {
        minTotalScore: row.threshold_min_total_score,
        noKeywordMatchPenalty: row.threshold_no_keyword_match_penalty,
        overPayTolerancePct: row.threshold_over_pay_tolerance_pct,
        underPayTolerancePct: row.threshold_under_pay_tolerance_pct,
      },
    },
  }
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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
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

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  let body: AdminMatchingConfigsRequest
  try {
    body = (await req.json()) as AdminMatchingConfigsRequest
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const action: Action = body.action ?? "list"

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

    const [{ data: isAdmin, error: adminCheckError }, { data: isSuperAdmin, error: superAdminError }] =
      await Promise.all([
        userClient.rpc("current_user_has_role", { role_name: "admin" }),
        userClient.rpc("current_user_has_role", { role_name: "super_admin" }),
      ])

    if (adminCheckError || superAdminError) {
      console.error("admin-matching-configs: role check failed", adminCheckError ?? superAdminError)
      return new Response(JSON.stringify({ error: "Failed to verify admin status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      })
    }

    if (action === "list") {
      const { data, error } = await serviceClient
        .from("matching_algorithm_config")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("admin-matching-configs: list failed", error)
        return new Response(JSON.stringify({ error: "Failed to list configs" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      const configs = (data ?? []).map(rowToConfig)

      return new Response(JSON.stringify({ configs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    if (action === "create") {
      if (!body.name || !body.config) {
        return new Response(JSON.stringify({ error: "Missing name or config" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const cols = overrideToDbColumns(body.config)
      cols.name = body.name
      cols.active = !!body.makeActive

      const { data, error } = await serviceClient
        .from("matching_algorithm_config")
        .insert(cols)
        .select("*")
        .single()

      if (error) {
        console.error("admin-matching-configs: create failed", error)
        return new Response(JSON.stringify({ error: "Failed to create config" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      const created = rowToConfig(data)

      return new Response(JSON.stringify({ config: created }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    if (action === "update") {
      if (!body.id || !body.config) {
        return new Response(JSON.stringify({ error: "Missing id or config" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const cols = overrideToDbColumns(body.config)
      if (body.name) {
        cols.name = body.name
      }
      if (body.makeActive != null) {
        cols.active = body.makeActive
      }

      const { data, error } = await serviceClient
        .from("matching_algorithm_config")
        .update(cols)
        .eq("id", body.id)
        .select("*")
        .single()

      if (error) {
        console.error("admin-matching-configs: update failed", error)
        return new Response(JSON.stringify({ error: "Failed to update config" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      const updated = rowToConfig(data)

      return new Response(JSON.stringify({ config: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    if (action === "activate") {
      if (!body.id) {
        return new Response(JSON.stringify({ error: "Missing id" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const { data, error } = await serviceClient
        .from("matching_algorithm_config")
        .update({ active: true })
        .eq("id", body.id)
        .select("*")
        .single()

      if (error) {
        console.error("admin-matching-configs: activate failed", error)
        return new Response(JSON.stringify({ error: "Failed to activate config" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      const updated = rowToConfig(data)

      return new Response(JSON.stringify({ config: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  } catch (error) {
    console.error("admin-matching-configs: unexpected error", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})

