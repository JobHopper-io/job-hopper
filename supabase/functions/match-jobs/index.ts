import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  matchJobs,
  type JobRecord,
  type SubscriberPreferences,
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

    const supabaseClient = createClient(
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
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        },
      )
    }

    const { data: profile, error: profileError } = await supabaseClient
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
    const limit = Math.max(1, Math.min(500, limitParam ? Number(limitParam) : 200))

    const { data: jobs, error: jobsError } = await supabaseClient
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
      .limit(limit)

    if (jobsError) {
      throw new Error(jobsError.message)
    }

    const jobRecords: JobRecord[] = (jobs ?? []).map((row: any) => ({
      id: row.id,
      title: row['Job Title'] ?? null,
      companyName: row['Company Name'] ?? null,
      location: row.Location ?? null,
      description: row.Description ?? null,
      jobHighlights: row['Job Highlights'] ?? null,
      applyLink: row['Apply Link'] ?? null,
      createdAt: row.created_at,
    }))

    const ranked = matchJobs(preferences, jobRecords)

    return new Response(
      JSON.stringify({
        profile_id: profile.id,
        total: ranked.length,
        jobs: ranked,
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

