import { FunctionsHttpError } from '@supabase/functions-js'
import { supabase } from '@/lib/supabase'
import { parseFunctionsInvokeError } from '@/lib/parse-functions-invoke-error'

export interface SkillsGapResult {
  matchingSkills: string[]
  missingSkills: string[]
  learningTopics: string[]
  generatedAt: string | null
}

export interface SkillsGapInvocationResult {
  data: SkillsGapResult | null
  error: Error | null
  /** True when the edge function rejected the call because the profile has no resume on
   * file - callers should show the existing "upload your resume first" prompt instead of a
   * generic error. */
  noResume: boolean
}

type SkillsGapFnResponse = {
  matchingSkills?: string[]
  missingSkills?: string[]
  learningTopics?: string[]
  generatedAt?: string | null
  error?: string
}

async function isNoResumeError(err: unknown): Promise<boolean> {
  if (!(err instanceof FunctionsHttpError)) return false
  try {
    const body = (await (err.context as Response).clone().json()) as { error?: string }
    return body?.error === 'no_resume'
  } catch {
    return false
  }
}

export const skillsGapAPI = {
  /**
   * LLM-generated skills-gap analysis for a job match (JobDetail): skills the resume already
   * shows, skills the job wants that it doesn't, and generic topics to learn to close the
   * gap. Cached server-side on job_matches after first generation - safe to call again, a
   * cache hit costs one DB read and no LLM call.
   */
  async generate(matchId: string): Promise<SkillsGapInvocationResult> {
    const { data, error } = await supabase.functions.invoke<SkillsGapFnResponse>('generate-skills-gap', {
      body: { job_match_id: matchId },
    })

    if (error) {
      if (await isNoResumeError(error)) {
        return { data: null, error: null, noResume: true }
      }
      const message = await parseFunctionsInvokeError(error)
      return { data: null, error: new Error(message), noResume: false }
    }

    if (
      data &&
      Array.isArray(data.matchingSkills) &&
      Array.isArray(data.missingSkills) &&
      Array.isArray(data.learningTopics)
    ) {
      return {
        data: {
          matchingSkills: data.matchingSkills,
          missingSkills: data.missingSkills,
          learningTopics: data.learningTopics,
          generatedAt: data.generatedAt ?? null,
        },
        error: null,
        noResume: false,
      }
    }

    return { data: null, error: new Error('Unexpected response from skills gap analysis'), noResume: false }
  },
}
