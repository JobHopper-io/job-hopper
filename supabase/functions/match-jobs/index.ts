import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import {
  type JobRecord,
  type MatchConfig,
  type RankedJob,
  type SubscriberPreferences,
  matchJobs,
} from '../_shared/job-matching-algorithm.ts'
import { getSubscriptionTierProductKeysForProfile } from '../_shared/subscription-tier-product-keys.ts'
import { sendEmail } from '../_shared/email.ts'
import {
  renderJobMatchDigest,
  type JobSummary,
} from '../_shared/email-templates.ts'
import { getFooterLinksForProfile } from '../_shared/unsubscribe-token.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MatchJobsPayload {
  profile_id: string
  limit?: number
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
    const payload = (await req.json()) as MatchJobsPayload

    if (!payload || typeof payload.profile_id !== 'string' || !payload.profile_id) {
      console.error('match-jobs: missing or invalid profile_id in payload', {
        payload,
      })
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = req.headers.get('Authorization') ?? ''

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('match-jobs: SUPABASE_URL or SUPABASE_ANON_KEY missing from environment', {
        hasSupabaseUrl: !!supabaseUrl,
        hasAnonKey: !!anonKey,
        hasServiceRoleKey: !!serviceRoleKey,
      })
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

    const supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // Load profile preferences and email/name for notifications.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        `
        id,
        first_name,
        email,
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
      .eq('id', payload.profile_id)
      .single()

    if (profileError || !profile) {
      console.error('match-jobs: profile not found for profile_id', {
        profileId: payload.profile_id,
        error: profileError,
      })
      return new Response(
        JSON.stringify({ error: 'Profile not found for profile_id' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        },
      )
    }

    const subscriptionTierProductKeys = await getSubscriptionTierProductKeysForProfile(
      supabaseAdminClient,
      profile.id,
    )

    const preferences: SubscriberPreferences = {
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

    type JobRow = {
      id: string
      job_title: string | null
      company_name: string | null
      role_category: string | null
      location: string | null
      is_remote: boolean | null
      description: string | null
      ai_job_briefing: string | null
      apply_link: string | null
      pay_min: number | null
      pay_max: number | null
      pay_type: string | null
      created_at: string
      posted_date: string | null
      subscription_tier: string
      employee_count: number | null
      sponsorship_likelihood: 'Low' | 'Medium' | 'High' | 'N/A' | null
    }

    const { data: activeConfig, error: configError } = await supabaseAdminClient
      .from('matching_algorithm_config')
      .select('*')
      .eq('active', true)
      .maybeSingle()

    if (configError) {
      console.error('match-jobs: failed to load active matching config', {
        error: configError.message,
      })
    }

    // Fetch all jobs from job_hopper_live in a single query.
    const { data, error: jobsError } = await supabase
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

    if (jobsError) {
      console.error('match-jobs: failed to load jobs from job_hopper_live', {
        error: jobsError,
      })
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
    const ranked = matchJobs(preferences, jobRecords, dbOverride ? mergeConfigOverrides(dbOverride, null) : undefined)

    // Load existing matches for this profile so we never duplicate a job match.
    const { data: existingMatches, error: existingError } = await supabase
      .from('job_matches')
      .select('job_id')
      .eq('profile_id', payload.profile_id)

    if (existingError) {
      console.error('match-jobs: failed to load existing job_matches for profile', {
        profileId: payload.profile_id,
        error: existingError,
      })
      return new Response(
        JSON.stringify({ error: 'Failed to load existing matches', details: existingError.message }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    const existingJobIds = new Set<string>()
    for (const row of existingMatches ?? []) {
      if (row.job_id) {
        existingJobIds.add(row.job_id)
      }
    }

    const rowsToInsert: { profile_id: string; job_id: string; score: number }[] = []

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
    const newlyMatchedRankedJobs: RankedJob[] = []
    if (rowsToInsert.length > 0) {
      const { error: insertError, count } = await supabase
        .from('job_matches')
        .insert(rowsToInsert, { count: 'exact' })

      if (insertError) {
        console.error('match-jobs: failed to insert job_matches', {
          profileId: payload.profile_id,
          rowsToInsertCount: rowsToInsert.length,
          error: insertError,
        })
        return new Response(
          JSON.stringify({ error: 'Failed to insert job_matches', details: insertError.message }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          },
        )
      }

      inserted = count ?? rowsToInsert.length
      const insertedJobIds = new Set(rowsToInsert.map((r) => r.job_id))
      for (const j of ranked) {
        if (insertedJobIds.has(j.id)) newlyMatchedRankedJobs.push(j)
      }
    }

    // Send job match digest email (respects notification_settings and frequency).
    let emailSent = false
    if (inserted > 0 && profile.email && newlyMatchedRankedJobs.length > 0) {
      try {
        const { data: settings } = await supabase
          .from('notification_settings')
          .select('job_match_email_enabled, job_match_email_frequency, email_unsubscribed_at, last_job_match_email_sent_at')
          .eq('profile_id', payload.profile_id)
          .maybeSingle()

        let settingsRow = settings
        if (!settingsRow) {
          const { data: insertedSettings } = await supabase
            .from('notification_settings')
            .insert({ profile_id: payload.profile_id })
            .select('job_match_email_enabled, job_match_email_frequency, email_unsubscribed_at, last_job_match_email_sent_at')
            .single()
          settingsRow = insertedSettings ?? null
        }
        const unsubscribed = settingsRow?.email_unsubscribed_at != null
        const enabled = settingsRow?.job_match_email_enabled !== false
        const frequency = settingsRow?.job_match_email_frequency ?? 'daily'
        const lastSent = settingsRow?.last_job_match_email_sent_at
          ? new Date(settingsRow.last_job_match_email_sent_at).getTime()
          : 0
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

        const shouldSend =
          !unsubscribed &&
          enabled &&
          (frequency === 'immediate' || frequency === 'daily' || (frequency === 'weekly' && lastSent < weekAgo))

        if (shouldSend) {
          const jobSummaries: JobSummary[] = newlyMatchedRankedJobs.slice(0, 10).map((j) => ({
            id: j.id,
            title: j.title,
            companyName: j.companyName,
            location: j.location,
            description: j.description,
            aiBriefing: j.aiBriefing,
            applyLink: j.applyLink,
          }))
          const footer = await getFooterLinksForProfile(payload.profile_id)
          const { html, text } = renderJobMatchDigest({
            recipientName: profile.first_name?.trim() || 'there',
            jobs: jobSummaries,
            dashboardUrl: `${footer.siteUrl}/dashboard`,
            footer: {
              preferencesUrl: footer.preferencesUrl,
              unsubscribeUrl: footer.unsubscribeUrl,
            },
          })
          const result = await sendEmail({
            to: profile.email,
            subject: 'Your new Job-Hopper matches',
            html,
            text,
            eventType: 'job_match_digest',
            templateKey: 'job_match_digest_default',
            profileId: payload.profile_id,
            payload: { job_count: jobSummaries.length },
            supabase,
          })
          if (result.success) {
            emailSent = true
            await supabase
              .from('notification_settings')
              .update({
                last_job_match_email_sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('profile_id', payload.profile_id)
          } else {
            console.error('match-jobs: sendEmail reported failure for job match digest', {
              profileId: payload.profile_id,
              jobCount: jobSummaries.length,
              error: result.error,
              messageId: result.messageId,
            })
          }
        }
      } catch (err) {
        console.error('match-jobs: job match email failed', {
          profileId: payload.profile_id,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return new Response(
      JSON.stringify({
        profile_id: payload.profile_id,
        limit,
        total_jobs_considered: ranked.length,
        existing_matches: existingJobIds.size,
        stored: inserted,
        email_sent: emailSent,
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


