import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type JobRecord,
  type SubscriberPreferences,
  matchJobsWithDebug,
} from '../_shared/match-jobs.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const preferences: SubscriberPreferences = {
      roles: (profile.target_role_categories ?? []) as string[],
      currentJobTitle: profile.current_job_title,
      currentIndustry: profile.current_industry,
      payRangeMin: profile.desired_salary_min,
      payRangeMax: profile.desired_salary_max,
      preferredLocations: (profile.preferred_locations ?? []) as string[],
      openToRelocation: profile.open_to_relocation,
      openToRemote: profile.open_to_remote,
    }

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
          "Job Title",
          "Company Name",
          Location,
          Description,
          "Job Highlights",
          "Apply Link",
          created_at
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
      title: row['Job Title'] ?? null,
      companyName: row['Company Name'] ?? null,
      location: row.Location ?? null,
      description: row.Description ?? null,
      jobHighlights: row['Job Highlights'] ?? null,
      applyLink: row['Apply Link'] ?? null,
      createdAt: row.created_at,
    }))

    const { ranked, debug } = matchJobsWithDebug(preferences, jobRecords)

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

