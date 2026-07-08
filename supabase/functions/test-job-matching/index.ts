import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import type { Database } from '../_shared/database.ts'
import { fetchJobRecordsForMatching } from '../_shared/fetch-jobs-for-matching.ts'
import { fetchMatchSynonymsForMatching } from '../_shared/fetch-match-synonyms.ts'
import { subscriberPreferencesFromProfile } from '../_shared/subscriber-preferences-from-profile.ts'
import type { MatchSynonymEntry } from '../_shared/match-synonym-row.ts'
import type { ProfileMatchingFields } from '../_shared/subscriber-preferences-from-profile.ts'
import {
  type MatchConfig,
  type SubscriberPreferences,
  matchJobsWithDebug,
} from '../_shared/job-matching-algorithm.ts'
import {
  assertSubscriptionTierKeysForMatching,
  getCareerLevelTierKeysForProfile,
} from '../_shared/subscription-tier-product-keys.ts'
import { configRowToOverride } from '../_shared/matching-algorithm-config-row.ts'
import { mergeConfigOverrides } from '../_shared/merge-match-config.ts'

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

    const supabaseAdminClient = createClient<Database>(
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

    type ProfileRow = ProfileMatchingFields & {
      id: string
      onboarding_completed?: boolean
    }

    let profile: ProfileRow

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

    const subscriptionTierProductKeys = await getCareerLevelTierKeysForProfile(
      supabaseAdminClient,
      profile.id,
    )

    const basePreferences: SubscriberPreferences = subscriberPreferencesFromProfile(
      profile,
      subscriptionTierProductKeys,
    )

    const preferences = mergePreferences(basePreferences, body.preferencesOverride)

    try {
      assertSubscriptionTierKeysForMatching(preferences.subscriptionTierProductKeys)
    } catch (tierKeysError) {
      const message = tierKeysError instanceof Error ? tierKeysError.message : String(tierKeysError)
      return new Response(JSON.stringify({ error: message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

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

    let matchSynonyms: MatchSynonymEntry[] = []
    try {
      matchSynonyms = await fetchMatchSynonymsForMatching(supabaseAdminClient)
    } catch (synonymError) {
      console.error('test-job-matching: failed to load match_synonyms', {
        error: synonymError instanceof Error ? synonymError.message : String(synonymError),
      })
    }

    const jobRecords = await fetchJobRecordsForMatching(
      supabaseAdminClient,
      preferences,
      combinedOverride,
      { maxJobs },
    )

    const { ranked, debug } = matchJobsWithDebug(preferences, jobRecords, combinedOverride, {
      synonyms: matchSynonyms,
    })

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

