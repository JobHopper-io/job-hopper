import { FunctionsHttpError } from '@supabase/functions-js'
import { supabase } from '@/lib/supabase'
import { parseFunctionsInvokeError } from '@/lib/parse-functions-invoke-error'

export interface InterviewPracticeTurn {
  sessionId: string
  feedback: string | null
  question: string
  quota: { used: number; dailyLimit: number } | null
}

export interface InterviewPracticeQuotaExceeded {
  used: number
  dailyLimit: number
}

export interface InterviewPracticeResult {
  data: InterviewPracticeTurn | null
  error: Error | null
  quotaExceeded: InterviewPracticeQuotaExceeded | null
}

type InterviewPracticeFnResponse = {
  session_id?: string
  feedback?: string | null
  question?: string
  quota?: { used: number; dailyLimit: number } | null
  error?: string
  used?: number
  dailyLimit?: number
}

async function tryParseQuotaExceeded(err: unknown): Promise<InterviewPracticeQuotaExceeded | null> {
  if (!(err instanceof FunctionsHttpError)) return null
  const res = err.context as Response
  try {
    const body = (await res.clone().json()) as InterviewPracticeFnResponse
    if (body?.error === 'quota_exceeded' && typeof body.used === 'number' && typeof body.dailyLimit === 'number') {
      return { used: body.used, dailyLimit: body.dailyLimit }
    }
    return null
  } catch {
    return null
  }
}

async function invokeInterviewPractice(body: Record<string, unknown>): Promise<InterviewPracticeResult> {
  const { data, error } = await supabase.functions.invoke<InterviewPracticeFnResponse>('interview-practice', {
    body,
  })

  if (error) {
    const quotaExceeded = await tryParseQuotaExceeded(error)
    if (quotaExceeded) {
      return { data: null, error: null, quotaExceeded }
    }
    const message = await parseFunctionsInvokeError(error)
    return { data: null, error: new Error(message), quotaExceeded: null }
  }

  if (data && typeof data.question === 'string' && typeof data.session_id === 'string') {
    return {
      data: {
        sessionId: data.session_id,
        feedback: data.feedback ?? null,
        question: data.question,
        quota: data.quota ?? null,
      },
      error: null,
      quotaExceeded: null,
    }
  }

  return { data: null, error: new Error('Unexpected response from interview practice'), quotaExceeded: null }
}

export const interviewPracticeAPI = {
  /** Starts a new practice session for a job match and returns the opening question. */
  async start(jobMatchId: string): Promise<InterviewPracticeResult> {
    return invokeInterviewPractice({ job_match_id: jobMatchId })
  },

  /** Submits an answer and returns feedback on it plus the next question. */
  async continue(sessionId: string, jobMatchId: string, answer: string): Promise<InterviewPracticeResult> {
    return invokeInterviewPractice({ job_match_id: jobMatchId, session_id: sessionId, answer })
  },
}
