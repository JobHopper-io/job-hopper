import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type JobRecord,
  type MatchConfig,
  type SubscriberPreferences,
  matchJobsWithDebug,
} from '../_shared/job-matching-algorithm.ts'
import { getSubscriptionTierProductKeysForProfile } from '../_shared/subscription-tier-product-keys.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TestJobMatchingBody {
  preferencesOverride?: Partial<SubscriberPreferences>
  matchConfigOverride?: Partial<MatchConfig>
}

function configRowToOverride(row: any): Partial<MatchConfig> {
  const keywordWeights = {
    currentJobTitleKeyword: row.keyword_current_job_title_weight,
    currentIndustryKeyword: row.keyword_current_industry_weight,
  }

  const payWeights = {
    insideRange: row.pay_inside_range_weight,
    nearRange: row.pay_near_range_weight,
    missingSalary: row.pay_missing_salary_weight,
    belowRangePenalty: row.pay_below_range_penalty,
  }

  const locationWeights = {
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
  }

  const recencyWeights = {
    baseRecency: row.recency_base_weight,
    perDayDecay: row.recency_per_day_decay,
    maxAgeDays: row.recency_max_age_days,
  }

  const thresholds = {
    minTotalScore: row.threshold_min_total_score,
    noKeywordMatchPenalty: row.threshold_no_keyword_match_penalty,
    overPayTolerancePct: row.threshold_over_pay_tolerance_pct,
    underPayTolerancePct: row.threshold_under_pay_tolerance_pct,
  }

  return {
    keywordWeights,
    payWeights,
    locationWeights,
    recencyWeights,
    thresholds,
  }
}

function mergeConfigOverrides(
  base: Partial<MatchConfig> | null | undefined,
  override: Partial<MatchConfig> | null | undefined,
): Partial<MatchConfig> | undefined {
  if (!base && !override) return undefined
  if (!base && override) return override
  if (base && !override) return base

  const b = base as Partial<MatchConfig>
  const o = override as Partial<MatchConfig>

  return {
    ...b,
    ...o,
    keywordWeights: {
      ...(b.keywordWeights ?? {}),
      ...(o.keywordWeights ?? {}),
    },
    payWeights: {
      ...(b.payWeights ?? {}),
      ...(o.payWeights ?? {}),
    },
    locationWeights: {
      ...(b.locationWeights ?? {}),
      ...(o.locationWeights ?? {}),
    },
    recencyWeights: {
      ...(b.recencyWeights ?? {}),
      ...(o.recencyWeights ?? {}),
    },
    thresholds: {
      ...(b.thresholds ?? {}),
      ...(o.thresholds ?? {}),
    },
    debug: {
      ...(b.debug ?? {}),
      ...(o.debug ?? {}),
    },
  }
}

function mergePreferences(
  base: SubscriberPreferences,
  overrides: Partial<SubscriberPreferences> | null | undefined,
): SubscriberPreferences {
  if (!overrides) return base
  return {
    subscriptionTierProductKeys:
      overrides.subscriptionTierProductKeys !== undefined
        ? overrides.subscriptionTierProductKeys
        : base.subscriptionTierProductKeys,
    roles: overrides.roles ?? base.roles,
    targetJobTitle: overrides.targetJobTitle !== undefined ? overrides.targetJobTitle : base.targetJobTitle,
    currentJobTitle: overrides.currentJobTitle !== undefined ? overrides.currentJobTitle : base.currentJobTitle,
    currentIndustry: overrides.currentIndustry !== undefined ? overrides.currentIndustry : base.currentIndustry,
    payRangeMin: overrides.payRangeMin !== undefined ? overrides.payRangeMin : base.payRangeMin,
    payRangeMax: overrides.payRangeMax !== undefined ? overrides.payRangeMax : base.payRangeMax,
    preferredLocations: overrides.preferredLocations ?? base.preferredLocations,
    openToRelocation: overrides.openToRelocation !== undefined ? overrides.openToRelocation : base.openToRelocation,
    openToRemote: overrides.openToRemote !== undefined ? overrides.openToRemote : base.openToRemote,
    locationRadiusMiles:
      overrides.locationRadiusMiles !== undefined
        ? overrides.locationRadiusMiles
        : base.locationRadiusMiles,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        },
      )
    }

    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    )

    const {
      data: { user },
    } = await supabaseUserClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        },
      )
    }

    const [{ data: isAdmin, error: adminCheckError }, { data: isSuperAdmin, error: superAdminError }] =
      await Promise.all([
        supabaseUserClient.rpc('current_user_has_role', { role_name: 'admin' }),
        supabaseUserClient.rpc('current_user_has_role', { role_name: 'super_admin' }),
      ])

    if (adminCheckError || superAdminError) {
      console.error('test-job-matching: role check failed', adminCheckError ?? superAdminError)
      return new Response(
        JSON.stringify({ error: 'Failed to verify admin status' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    if (!isAdmin && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        },
      )
    }

    const { data: profile, error: profileError } = await supabaseUserClient
      .from('profiles')
      .select(
        `
        id,
        current_job_title,
        target_job_title,
        current_industry,
        target_role_categories,
        desired_salary_min,
        desired_salary_max,
        preferred_locations,
        open_to_relocation,
        open_to_remote,
        location_radius_miles
      `,
      )
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile) {
      throw new Error('User profile not found')
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      throw new Error('Service role key not configured')
    }

    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
        },
      },
    )

    const subscriptionTierProductKeys = await getSubscriptionTierProductKeysForProfile(
      supabaseAdminClient,
      profile.id,
    )

    const basePreferences: SubscriberPreferences = {
      subscriptionTierProductKeys,
      roles: (profile.target_role_categories ?? []) as string[],
      targetJobTitle: profile.target_job_title,
      currentJobTitle: profile.current_job_title,
      currentIndustry: profile.current_industry,
      payRangeMin: profile.desired_salary_min,
      payRangeMax: profile.desired_salary_max,
      preferredLocations: (profile.preferred_locations ?? []) as string[],
      openToRelocation: profile.open_to_relocation,
      openToRemote: profile.open_to_remote,
      locationRadiusMiles: profile.location_radius_miles ?? null,
    }

    let body: TestJobMatchingBody = {}
    if (req.method === 'POST' && req.headers.get('Content-Type')?.includes('application/json')) {
      try {
        body = (await req.json()) as TestJobMatchingBody
      } catch {
        // ignore invalid JSON; use empty overrides
      }
    }

    const preferences = mergePreferences(basePreferences, body.preferencesOverride)

    const url = new URL(req.url)
    const limitParam = url.searchParams.get('limit')
    const maxJobs =
      limitParam != null && !Number.isNaN(Number(limitParam))
        ? Math.max(1, Math.floor(Number(limitParam)))
        : null

    const { data: activeConfig, error: configError } = await supabaseAdminClient
      .from('matching_algorithm_config')
      .select('*')
      .eq('active', true)
      .maybeSingle()

    if (configError) {
      console.error('test-job-matching: failed to load active matching config', {
        message: configError.message,
      })
    }

    const allJobs: any[] = []
    const pageSize = 1000
    let offset = 0

    // Fetch ALL jobs from job_hopper_live in pages (optionally capped by ?limit=).
    while (true) {
      const remaining = maxJobs != null ? maxJobs - allJobs.length : null
      if (remaining !== null && remaining <= 0) {
        break
      }

      const effectivePageSize =
        remaining !== null && remaining < pageSize ? remaining : pageSize

      const { data: page, error: jobsError } = await supabaseAdminClient
        .from('job_hopper_live')
        .select(
          `
          id,
          job_title,
          company_name,
          role_category,
          location,
          is_remote,
          description,
          ai_job_briefing,
          apply_link,
          pay_min,
          pay_max,
          pay_type,
          created_at,
          posted_date,
          subscription_tier,
          employee_count,
          sponsorship_likelihood
        `,
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + effectivePageSize - 1)

      if (jobsError) {
        throw new Error(jobsError.message)
      }

      if (!page || page.length === 0) {
        break
      }

      allJobs.push(...page)

      if (page.length < effectivePageSize) {
        break
      }

      offset += effectivePageSize
    }

    const jobRecords: JobRecord[] = allJobs.map((row: any) => ({
      id: row.id,
      title: row.job_title ?? null,
      companyName: row.company_name ?? null,
      roleCategory: row.role_category ?? null,
      location: row.location ?? null,
      isRemote: !!row.is_remote,
      description: row.description ?? null,
      aiBriefing: row.ai_job_briefing ?? null,
      applyLink: row.apply_link ?? null,
      payMin: row.pay_min,
      payMax: row.pay_max,
      payType: row.pay_type,
      createdAt: row.created_at,
      postedDate: row.posted_date,
      subscriptionTier: row.subscription_tier ?? null,
      employeeCount: row.employee_count ?? null,
      sponsorshipLikelihood: row.sponsorship_likelihood ?? 'N/A',
    }))

    const dbOverride = activeConfig ? configRowToOverride(activeConfig) : null
    const combinedOverride = mergeConfigOverrides(dbOverride, body.matchConfigOverride ?? null)

    const { ranked, debug } = matchJobsWithDebug(preferences, jobRecords, combinedOverride)

    return new Response(
      JSON.stringify({
        profile_id: profile.id,
        total: ranked.length,
        jobs: ranked,
        debug,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})

