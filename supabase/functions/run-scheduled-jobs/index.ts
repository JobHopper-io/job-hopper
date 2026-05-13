import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PER_RUN_LIMIT = 25
const INVOCATION_TIMEOUT_MS = 60_000
const STALE_MINUTES = 20
const ERROR_MESSAGE_MAX_LENGTH = 1000

type ScheduledJobRow = {
  id: string
  function_name: string
  payload: Record<string, unknown>
  run_at: string
  status: string
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('run-scheduled-jobs invoked', {
    requestedAt: new Date().toISOString(),
  })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const authHeader = req.headers.get('Authorization') ?? ''

  if (!supabaseUrl || !anonKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY for run-scheduled-jobs', {
      hasSupabaseUrl: !!supabaseUrl,
      hasAnonKey: !!anonKey,
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

  const now = new Date().toISOString()
  const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString()

  // 1. Recover stale "running" jobs
  const { error: staleError } = await supabase
    .from('scheduled_jobs')
    .update({
      status: 'failed',
      error_message: `Scheduler timeout or process crash; marked failed after ${STALE_MINUTES} minutes`,
      finished_at: now,
    })
    .eq('status', 'running')
    .lt('started_at', staleThreshold)

  if (staleError) {
    console.error('Failed to recover stale scheduled jobs', {
      error: staleError.message,
    })
  }

  if (staleError) {
    return new Response(
      JSON.stringify({ error: 'Failed to recover stale jobs', details: staleError.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }

  // 2. Select pending jobs
  const { data: pending, error: selectError } = await supabase
    .from('scheduled_jobs')
    .select('id, function_name, payload, run_at, status, error_message, started_at, finished_at, created_at')
    .eq('status', 'pending')
    .lte('run_at', now)
    .order('run_at', { ascending: true })
    .limit(PER_RUN_LIMIT)

  if (selectError) {
    console.error('Failed to select pending scheduled jobs', {
      error: selectError.message,
    })

    return new Response(
      JSON.stringify({ error: 'Failed to select pending jobs', details: selectError.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }

  const jobs = (pending ?? []) as ScheduledJobRow[]
  let completed = 0
  let failed = 0

  console.log('pending scheduled jobs selected', {
    count: jobs.length,
  })

  const jobResults: {
    id: string
    function_name: string
    run_at: string
    status: 'completed' | 'failed'
    error_message: string | null
  }[] = []

  for (const job of jobs) {
    console.log('processing scheduled job', {
      id: job.id,
      function_name: job.function_name,
      run_at: job.run_at,
    })

    // Mark as running
    await supabase
      .from('scheduled_jobs')
      .update({ status: 'running', started_at: now })
      .eq('id', job.id)

    let errorMessage: string | null = null
    let success = false

    try {
      const url = `${supabaseUrl}/functions/v1/${job.function_name}`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), INVOCATION_TIMEOUT_MS)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(job.payload ?? {}),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        console.log('scheduled job invocation succeeded', {
          id: job.id,
          function_name: job.function_name,
          status: response.status,
        })
        success = true
      } else {
        const body = await response.text()
        errorMessage = truncate(
          `HTTP ${response.status}: ${body || response.statusText}`,
          ERROR_MESSAGE_MAX_LENGTH,
        )
        console.error('scheduled job invocation failed with non-2xx response', {
          id: job.id,
          function_name: job.function_name,
          status: response.status,
        })
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMessage = 'Invocation timeout after 60s'
          console.error('scheduled job invocation timed out', {
            id: job.id,
            function_name: job.function_name,
          })
        } else {
          errorMessage = truncate(err.message, ERROR_MESSAGE_MAX_LENGTH)
          console.error('scheduled job invocation threw error', {
            id: job.id,
            function_name: job.function_name,
            message: err.message,
          })
        }
      } else {
        errorMessage = 'Unknown invocation error'
        console.error('scheduled job invocation threw non-Error value', {
          id: job.id,
          function_name: job.function_name,
        })
      }
    }

    const finishedAt = new Date().toISOString()
    if (success) {
      completed += 1
      await supabase
        .from('scheduled_jobs')
        .update({
          status: 'completed',
          finished_at: finishedAt,
          error_message: null,
        })
        .eq('id', job.id)
    } else {
      failed += 1
      await supabase
        .from('scheduled_jobs')
        .update({
          status: 'failed',
          finished_at: finishedAt,
          error_message: errorMessage,
        })
        .eq('id', job.id)
    }

    jobResults.push({
      id: job.id,
      function_name: job.function_name,
      run_at: job.run_at,
      status: success ? 'completed' : 'failed',
      error_message: errorMessage,
    })
  }

  console.log('run-scheduled-jobs completed', {
    processed: jobs.length,
    completed,
    failed,
  })

  return new Response(
    JSON.stringify({
      processed: jobs.length,
      completed,
      failed,
      jobs: jobResults,
      timestamp: now,
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    },
  )
})

function truncate(s: string, maxLength: number): string {
  if (s.length <= maxLength) return s
  return s.slice(0, maxLength - 3) + '...'
}
