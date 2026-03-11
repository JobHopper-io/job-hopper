import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type JobRecord,
  type MatchConfig,
  type SubscriberPreferences,
  matchJobsWithDebug,
} from '../_shared/job-matching-algorithm.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TestJobMatchingBody {
  preferencesOverride?: Partial<SubscriberPreferences>
  matchConfigOverride?: Partial<MatchConfig>
}

function mergePreferences(
  base: SubscriberPreferences,
  overrides: Partial<SubscriberPreferences> | null | undefined,
): SubscriberPreferences {
  if (!overrides) return base
  return {
    roles: overrides.roles ?? base.roles,
    currentJobTitle: overrides.currentJobTitle !== undefined ? overrides.currentJobTitle : base.currentJobTitle,
    currentIndustry: overrides.currentIndustry !== undefined ? overrides.currentIndustry : base.currentIndustry,
    payRangeMin: overrides.payRangeMin !== undefined ? overrides.payRangeMin : base.payRangeMin,
    payRangeMax: overrides.payRangeMax !== undefined ? overrides.payRangeMax : base.payRangeMax,
    preferredLocations: overrides.preferredLocations ?? base.preferredLocations,
    openToRelocation: overrides.openToRelocation !== undefined ? overrides.openToRelocation : base.openToRelocation,
    openToRemote: overrides.openToRemote !== undefined ? overrides.openToRemote : base.openToRemote,
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

    const { data: profile, error: profileError } = await supabaseUserClient
      .from('profiles')
      .select(
        `
        id,
        current_job_title,
        current_industry,
        target_role_categories,
        desired_salary_min,
        desired_salary_max,
        preferred_locations,
        open_to_relocation,
        open_to_remote
      `,
      )
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile) {
      throw new Error('User profile not found')
    }

    const basePreferences: SubscriberPreferences = {
      roles: (profile.target_role_categories ?? []) as string[],
      currentJobTitle: profile.current_job_title,
      currentIndustry: profile.current_industry,
      payRangeMin: profile.desired_salary_min,
      payRangeMax: profile.desired_salary_max,
      preferredLocations: (profile.preferred_locations ?? []) as string[],
      openToRelocation: profile.open_to_relocation,
      openToRemote: profile.open_to_remote,
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
          posted_date
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
    }))

    const { ranked, debug } = matchJobsWithDebug(preferences, jobRecords, body.matchConfigOverride)

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

