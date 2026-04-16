import { supabase } from '@/lib/supabase'
import type { FunctionsHttpError } from '@supabase/supabase-js'

/** Mirrors `job_processor.models.RunOptions` defaults (FastAPI). */
export const DEFAULT_JOB_PROCESSOR_RUN_OPTIONS = {
  limit: 50,
  status_filter: 'pending' as const,
  batch_size: 25,
  max_concurrent_llm: 4,
  max_concurrent_apollo: 4,
  max_concurrent_brave: 2,
  max_concurrent_fetch: 8,
  max_concurrent_jobs: 8,
  skip_domain_resolution: false,
  skip_apollo: false,
  skip_enrichment: false,
  force_clear_apollo_limit: false,
  dry_run: false,
}

export type JobProcessorRunOptions = typeof DEFAULT_JOB_PROCESSOR_RUN_OPTIONS

export interface JobProcessorCreateRunResponse {
  run_id: string
  status: string
}

export interface JobProcessorRunStatus {
  id: string
  status: string
  options: Record<string, unknown>
  counts: Record<string, number>
  error_message?: string | null
  created_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  updated_at?: string | null
}

type HealthResponse = { health: unknown }
type CreateRunEnvelope = { createRun: JobProcessorCreateRunResponse }
type GetRunEnvelope = { getRun: JobProcessorRunStatus }

function messageFromFunctionsHttpError(error: FunctionsHttpError): string {
  const ctx = error.context as { body?: string } | undefined
  const raw = ctx?.body
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw) as { error?: string; detail?: string }
      if (parsed.error) return parsed.error
      if (parsed.detail) return parsed.detail
    } catch {
      return raw.slice(0, 500)
    }
  }
  return error.message
}

export const jobProcessorAdminAPI = {
  async checkHealth(): Promise<{ data: unknown | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<HealthResponse>('admin-job-processor', {
      body: { action: 'health' },
    })
    if (error) {
      return { data: null, error: new Error(messageFromFunctionsHttpError(error as FunctionsHttpError)) }
    }
    if (!data?.health) {
      return { data: null, error: new Error('Unexpected response from admin-job-processor') }
    }
    return { data: data.health, error: null }
  },

  async createRun(
    options: JobProcessorRunOptions,
  ): Promise<{ data: JobProcessorCreateRunResponse | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<CreateRunEnvelope>('admin-job-processor', {
      body: { action: 'createRun', options },
    })
    if (error) {
      return { data: null, error: new Error(messageFromFunctionsHttpError(error as FunctionsHttpError)) }
    }
    if (!data?.createRun?.run_id) {
      return { data: null, error: new Error('Unexpected response from admin-job-processor') }
    }
    return { data: data.createRun, error: null }
  },

  async getRun(runId: string): Promise<{ data: JobProcessorRunStatus | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<GetRunEnvelope>('admin-job-processor', {
      body: { action: 'getRun', runId },
    })
    if (error) {
      return { data: null, error: new Error(messageFromFunctionsHttpError(error as FunctionsHttpError)) }
    }
    if (!data?.getRun?.id) {
      return { data: null, error: new Error('Unexpected response from admin-job-processor') }
    }
    return { data: data.getRun, error: null }
  },
}
