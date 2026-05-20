import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { fetchJobRecordsForMatching } from '../_shared/fetch-jobs-for-matching.ts'
import {
  type MatchConfig,
  type SubscriberPreferences,
  matchJobsWithDebug,
} from '../_shared/job-matching-algorithm.ts'
import { getSubscriptionTierProductKeysForProfile } from '../_shared/subscription-tier-product-keys.ts'
import { configRowToOverride } from '../_shared/matching-algorithm-config-row.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TestJobMatchingBody {
  /** When set, base subscriber preferences and `profile_id` in the response use this profile (must have completed onboarding). */
  targetProfileId?: string
  preferencesOverride?: Partial<SubscriberPreferences>
  matchConfigOverride?: Partial<MatchConfig>
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
    phraseWeights: {
      primary: { ...(b.phraseWeights?.primary ?? {}), ...(o.phraseWeights?.primary ?? {}) },
      secondary: { ...(b.phraseWeights?.secondary ?? {}), ...(o.phraseWeights?.secondary ?? {}) },
      industry: { ...(b.phraseWeights?.industry ?? {}), ...(o.phraseWeights?.industry ?? {}) },
    },
    phraseMatching: {
      ...(b.phraseMatching ?? {}),
      ...(o.phraseMatching ?? {}),
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

    let body: TestJobMatchingBody = {}
    if (req.method === 'POST' && req.headers.get('Content-Type')?.includes('application/json')) {
      try {
        body = (await req.json()) as TestJobMatchingBody
      } catch {
        // ignore invalid JSON; use empty overrides
      }
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

    const targetProfileId =
      typeof body.targetProfileId === 'string' ? body.targetProfileId.trim() : ''

    let profile: {
      id: string
      current_job_title: string | null
      target_job_title: string | null
      current_industry: string | null
      target_role_categories: unknown
      desired_salary_min: number | null
      desired_salary_max: number | null
      preferred_locations: unknown
      open_to_relocation: boolean | null
      open_to_remote: boolean | null
      location_radius_miles: number | null
    }

    if (targetProfileId.length > 0) {
      const { data: targetProfile, error: targetProfileError } = await supabaseAdminClient
        .from('profiles')
        .select(
          `
        id,
        onboarding_completed,
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
        .eq('id', targetProfileId)
        .eq('onboarding_completed', true)
        .single()

      if (targetProfileError || !targetProfile) {
        return new Response(
          JSON.stringify({
            error: 'Target profile not found or has not completed onboarding',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      profile = targetProfile
    } else {
      const { data: selfProfile, error: profileError } = await supabaseUserClient
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

      if (profileError || !selfProfile) {
        throw new Error('User profile not found')
      }

      profile = selfProfile
    }

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
      .eq('archived', false)
      .maybeSingle()

    if (configError) {
      console.error('test-job-matching: failed to load active matching config', {
        message: configError.message,
      })
    }

    const dbOverride = activeConfig ? configRowToOverride(activeConfig) : null
    const combinedOverride = mergeConfigOverrides(dbOverride, body.matchConfigOverride ?? null)

    const jobRecords = await fetchJobRecordsForMatching(
      supabaseAdminClient,
      preferences,
      combinedOverride,
      { maxJobs },
    )

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

