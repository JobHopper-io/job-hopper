import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import type { MatchConfig } from "../_shared/job-matching-algorithm.ts"
import {
  configRowToOverride,
  type MatchingAlgorithmConfigRow,
} from "../_shared/matching-algorithm-config-row.ts"
import {
  overrideToFullConfig,
  validateMatchConfig,
} from "../_shared/merge-match-config.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type Action = "list" | "create" | "update" | "activate" | "archive"

type MatchConfigOverrideInput = Partial<MatchConfig>

interface AdminMatchingConfigsRequest {
  action?: Action
  id?: string
  name?: string
  makeActive?: boolean
  config?: MatchConfigOverrideInput
}

function overrideToDbColumns(full: MatchConfig): Record<string, number | boolean | string> {
  return {
    cat_weight_phrase: full.categoryWeights.phrase,
    cat_weight_pay: full.categoryWeights.pay,
    cat_weight_location: full.categoryWeights.location,
    cat_weight_recency: full.categoryWeights.recency,
    cat_weight_filter_matches: full.categoryWeights.filterMatches,
    phrase_tier_factor_primary: full.phrase.tierFactors.primary,
    phrase_tier_factor_industry: full.phrase.tierFactors.industry,
    phrase_tier_factor_secondary: full.phrase.tierFactors.secondary,
    phrase_surface_weight_title: full.phrase.surfaceWeights.title,
    phrase_surface_weight_description: full.phrase.surfaceWeights.description,
    phrase_surface_weight_briefing: full.phrase.surfaceWeights.briefing,
    pay_missing_salary_quality: full.pay.missingSalaryQuality,
    pay_near_range_quality: full.pay.nearRangeQuality,
    pay_above_range_quality: full.pay.aboveRangeQuality,
    pay_over_tolerance_fraction: full.pay.overToleranceFraction,
    pay_under_tolerance_fraction: full.pay.underToleranceFraction,
    pay_hard_floor_enabled: full.pay.hardFloorEnabled,
    pay_hard_floor_fraction: full.pay.hardFloorFraction,
    loc_band_d0_10: full.location.bandQualities.d0to10,
    loc_band_d10_25: full.location.bandQualities.d10to25,
    loc_band_d25_50: full.location.bandQualities.d25to50,
    loc_band_d50_100: full.location.bandQualities.d50to100,
    loc_band_beyond_100: full.location.bandQualities.dBeyond100,
    loc_same_metro_quality: full.location.sameMetroQuality,
    loc_same_state_quality: full.location.sameStateQuality,
    loc_remote_as_perfect: full.location.remoteAsPerfect,
    loc_relocation_gate_enabled: full.location.relocationGateEnabled,
    recency_max_age_days: full.recency.maxAgeDays,
    threshold_min_total_score: full.thresholds.minTotalScore,
    phrase_gate_require_primary_or_industry: full.phraseGate.requirePrimaryOrIndustry,
  }
}

function rowToConfig(row: MatchingAlgorithmConfigRow) {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    config: configRowToOverride(row),
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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
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

  // apikey uses the service-role key (not anon) so the PostgREST `current_user_has_role`
  // RPC calls succeed; Authorization still forwards the caller's own JWT, so auth.uid()
  // inside that function resolves to the caller, not an elevated identity.
  const userClient = createClient(supabaseUrl, serviceRoleKey, {
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
        .eq("archived", false)
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

    if (action === "create" || action === "update") {
      if (!body.config) {
        return new Response(JSON.stringify({ error: "Missing config" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const full = overrideToFullConfig(body.config)
      const validationError = validateMatchConfig(full)
      if (validationError) {
        return new Response(JSON.stringify({ error: validationError }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const cols = overrideToDbColumns(full)

      if (action === "create") {
        if (!body.name) {
          return new Response(JSON.stringify({ error: "Missing name" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          })
        }

        cols.name = body.name
        cols.active = !!body.makeActive
        cols.archived = false

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

        return new Response(JSON.stringify({ config: rowToConfig(data) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        })
      }

      if (!body.id) {
        return new Response(JSON.stringify({ error: "Missing id" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

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
        .eq("archived", false)
        .select("*")
        .single()

      if (error) {
        console.error("admin-matching-configs: update failed", error)
        return new Response(JSON.stringify({ error: "Failed to update config" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      return new Response(JSON.stringify({ config: rowToConfig(data) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    if (action === "archive") {
      if (!body.id) {
        return new Response(JSON.stringify({ error: "Missing id" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const { data: existing, error: fetchError } = await serviceClient
        .from("matching_algorithm_config")
        .select("id, active, archived")
        .eq("id", body.id)
        .maybeSingle()

      if (fetchError) {
        console.error("admin-matching-configs: archive lookup failed", fetchError)
        return new Response(JSON.stringify({ error: "Failed to archive config" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      if (!existing) {
        return new Response(JSON.stringify({ error: "Config not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        })
      }

      if (existing.archived) {
        return new Response(JSON.stringify({ error: "Config is already archived" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      if (existing.active) {
        return new Response(JSON.stringify({ error: "Cannot archive the active configuration" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const { error } = await serviceClient
        .from("matching_algorithm_config")
        .update({ archived: true })
        .eq("id", body.id)

      if (error) {
        console.error("admin-matching-configs: archive failed", error)
        return new Response(JSON.stringify({ error: "Failed to archive config" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      return new Response(JSON.stringify({ ok: true }), {
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
        .eq("archived", false)
        .select("*")
        .single()

      if (error) {
        console.error("admin-matching-configs: activate failed", error)
        return new Response(JSON.stringify({ error: "Failed to activate config" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      return new Response(JSON.stringify({ config: rowToConfig(data) }), {
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
