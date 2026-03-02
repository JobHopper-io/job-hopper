import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type JobRecord,
  type SubscriberPreferences,
  matchJobs,
} from '../_shared/match-jobs.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MatchProfileJobsPayload {
  profile_id: string
  limit?: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      },
    )
  }

  try {
    const payload = (await req.json()) as MatchProfileJobsPayload

    if (!payload || typeof payload.profile_id !== 'string' || !payload.profile_id) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid profile_id' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    const rawLimit = payload.limit
    const limit =
      rawLimit != null && !Number.isNaN(Number(rawLimit))
        ? Math.min(Math.max(1, Math.floor(Number(rawLimit))), 100)
        : 15

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const authHeader = req.headers.get('Authorization') ?? ''

    if (!supabaseUrl || !anonKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfiguration' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    // Load profile preferences for this profile id.
    const { data: profile, error: profileError } = await supabase
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
      .eq('id', payload.profile_id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found for profile_id' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        },
      )
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

    type JobRow = {
      id: number
      'Job Title': string | null
      'Company Name': string | null
      Location: string | null
      Description: string | null
      'Job Highlights': string | null
      'Apply Link': string | null
      created_at: string
    }

    // Fetch all jobs from job_hopper_live in a single query.
    const { data, error: jobsError } = await supabase
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

    if (jobsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to load jobs', details: jobsError.message }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    const allJobs = (data ?? []) as JobRow[]

    const jobRecords: JobRecord[] = allJobs.map((row) => ({
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

    // Load existing matches for this profile so we never duplicate a job match.
    const { data: existingMatches, error: existingError } = await supabase
      .from('job_matches')
      .select('job_id')
      .eq('profile_id', payload.profile_id)

    if (existingError) {
      return new Response(
        JSON.stringify({ error: 'Failed to load existing matches', details: existingError.message }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    const existingJobIds = new Set<number>()
    for (const row of existingMatches ?? []) {
      if (typeof row.job_id === 'number') {
        existingJobIds.add(row.job_id)
      }
    }

    const rowsToInsert: { profile_id: string; job_id: number; score: number }[] = []

    for (const job of ranked) {
      if (rowsToInsert.length >= limit) {
        break
      }
      if (existingJobIds.has(job.id)) {
        continue
      }
      rowsToInsert.push({
        profile_id: payload.profile_id,
        job_id: job.id,
        score: job.score,
      })
    }

    let inserted = 0
    if (rowsToInsert.length > 0) {
      const { error: insertError, count } = await supabase
        .from('job_matches')
        .insert(rowsToInsert, { count: 'exact' })

      if (insertError) {
        return new Response(
          JSON.stringify({ error: 'Failed to insert job_matches', details: insertError.message }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          },
        )
      }

      inserted = count ?? rowsToInsert.length
    }

    return new Response(
      JSON.stringify({
        profile_id: payload.profile_id,
        limit,
        total_jobs_considered: ranked.length,
        existing_matches: existingJobIds.size,
        stored: inserted,
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
        status: 500,
      },
    )
  }
})

