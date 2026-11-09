import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'
import { downloadResumeBytes, bytesToResumePlainText } from './resume-text.ts'
import { callChatCompletion } from './llm.ts'

type AdminClient = SupabaseClient

/** Grep-friendly prefix for resume advice fulfillment logs. */
const LOG = '[resume-advice]'

// Awaited inside the request (like generate-why-fit), so it must finish well under the
// edge function's 150s request limit.
const LLM_TIMEOUT_MS = 90_000

// Ported verbatim from the former n8n "Resume Advice" workflow.
const RESUME_ADVICE_SYSTEM = `You are an expert resume coach. You are given a candidate's RESUME and a target JOB DESCRIPTION.

Produce specific, actionable advice for tailoring the resume to this job. Focus on:
- Concrete gaps between the resume and the job's requirements
- Skills or keywords from the job description the resume should surface
- Bullet points that should be rewritten to show measurable impact, with example rewrites
- Anything on the resume that is irrelevant to this role and could be cut

Write clear, structured advice the candidate can act on directly. Do not invent experience the candidate does not have.`

function isPerJobResumeProduct(key: string): boolean {
  return key === 'per_job_resume_advice'
}

async function loadJobDescriptionForMatch(
  supabaseAdmin: AdminClient,
  profileId: string,
  jobMatchId: string,
): Promise<string | null> {
  const { data: match, error: matchError } = await supabaseAdmin
    .from('job_matches')
    .select('job_id')
    .eq('id', jobMatchId)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (matchError || !match?.job_id) {
    console.error(`${LOG} job match not found for per-job resume`, {
      jobMatchId,
      profileId,
      message: matchError?.message,
    })
    return null
  }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('job_hopper_live')
    .select('description')
    .eq('id', match.job_id)
    .maybeSingle()

  if (jobError) {
    console.error(`${LOG} failed to load job description`, { message: jobError.message })
    return null
  }

  const d = job?.description
  if (typeof d === 'string' && d.trim()) return d.trim()
  return null
}

const ERROR_MESSAGE_MAX_LENGTH = 1000

/**
 * Records a terminal failure so the frontend stops waiting.
 *
 * If the worker dies mid-request nothing here runs; the stale-row sweeper in
 * run-scheduled-jobs resolves (and refunds) the row instead.
 */
async function markResumeProductFailed(
  supabaseAdmin: AdminClient,
  resumeProductId: string,
  reason: string,
): Promise<void> {
  const errorMessage =
    reason.length > ERROR_MESSAGE_MAX_LENGTH
      ? reason.slice(0, ERROR_MESSAGE_MAX_LENGTH - 3) + '...'
      : reason

  // Guard on status='pending' AND return the affected row: if it already completed,
  // this matches nothing and we must NOT refund a successful generation.
  const { data: updated, error } = await supabaseAdmin
    .from('resume_products')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', resumeProductId)
    .eq('status', 'pending')
    .select('id')

  if (error) {
    console.error(`${LOG} failed to mark resume_products failed`, {
      resumeProductId,
      message: error.message,
    })
    return
  }

  if (!updated || updated.length === 0) {
    // Row was no longer pending — nothing to fail or refund.
    console.log(`${LOG} skip mark failed: row not pending`, { resumeProductId })
    return
  }

  // Reverse the Core/Premium daily credit this row held. No-op for free-tier rows
  // (daily_usage_date NULL) and idempotent (clears the stamp), so the sweeper can't
  // double-refund a row this path already handled.
  const { error: refundError } = await supabaseAdmin.rpc('refund_daily_resume_advice', {
    p_resume_product_id: resumeProductId,
  })
  if (refundError) {
    console.error(`${LOG} daily refund failed`, { resumeProductId, message: refundError.message })
  }

  console.log(`${LOG} marked failed`, { resumeProductId, reason: errorMessage })
}

export type FulfillResumeAdviceParams = {
  supabaseAdmin: AdminClient
  resumeProductId: string
  productKey: string
  profileId: string
  /** Required for per-job product (per_job_resume_advice) */
  jobMatchId: string | null
}

/**
 * Loads resume + job description, calls the LLM, and writes the advice (or a failure) to
 * the resume_products row. Callers await it; it never throws for expected failures.
 */
export async function fulfillResumeAdvice(params: FulfillResumeAdviceParams): Promise<void> {
  const { supabaseAdmin, resumeProductId, productKey, profileId, jobMatchId } = params

  console.log(`${LOG} fulfill start`, {
    resumeProductId,
    productKey,
    profileId,
    jobMatchId: jobMatchId ?? null,
  })

  const { data: rowState } = await supabaseAdmin
    .from('resume_products')
    .select('status')
    .eq('id', resumeProductId)
    .maybeSingle()
  if (rowState?.status === 'complete') {
    console.log(`${LOG} skip: resume_products already complete`, { resumeProductId, status: rowState.status })
    return
  }

  if (isPerJobResumeProduct(productKey) && (!jobMatchId || !jobMatchId.trim())) {
    console.error(`${LOG} skip: per-job purchase missing job_match_id`, { resumeProductId, productKey })
    await markResumeProductFailed(
      supabaseAdmin,
      resumeProductId,
      'Resume advice was requested without a job. Please try again from the job page.',
    )
    return
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('resume_bucket_key')
    .eq('id', profileId)
    .maybeSingle()

  if (profileError || !profile?.resume_bucket_key?.trim()) {
    console.error(`${LOG} skip: profile has no resume on file`, {
      resumeProductId,
      profileId,
      message: profileError?.message,
    })
    await markResumeProductFailed(
      supabaseAdmin,
      resumeProductId,
      'No resume on file. Upload a resume in your profile, then try again.',
    )
    return
  }

  const bucketKey = profile.resume_bucket_key.trim()
  console.log(`${LOG} loading resume from storage`, { resumeProductId, bucketKeySuffix: bucketKey.slice(-24) })

  const bytes = await downloadResumeBytes(supabaseAdmin, bucketKey)
  if (!bytes) {
    await markResumeProductFailed(
      supabaseAdmin,
      resumeProductId,
      'Could not read your resume file. Try re-uploading it in your profile.',
    )
    return
  }

  const resumeText = await bytesToResumePlainText(bucketKey, bytes)
  if (!resumeText) {
    console.error(`${LOG} skip: could not extract plain text from resume file`, { resumeProductId, bucketKey })
    await markResumeProductFailed(
      supabaseAdmin,
      resumeProductId,
      'Could not read any text from your resume. Upload a text-based PDF or a .txt file.',
    )
    return
  }

  console.log(`${LOG} resume text extracted`, { resumeProductId, charCount: resumeText.length })

  if (!isPerJobResumeProduct(productKey)) {
    await markResumeProductFailed(supabaseAdmin, resumeProductId, `Unsupported product: ${productKey}`)
    return
  }
  const jd = await loadJobDescriptionForMatch(supabaseAdmin, profileId, jobMatchId as string)
  if (!jd) {
    console.error(`${LOG} skip: no job description for per-job resume`, { resumeProductId, jobMatchId })
    await markResumeProductFailed(
      supabaseAdmin,
      resumeProductId,
      'This job has no description to tailor against.',
    )
    return
  }

  // Falls back to LLM_MODEL_WHY_FIT like every other LLM function: the provider behind
  // LLM_BASE_URL is self-hosted and has no model named 'gpt-4o-mini'.
  const model =
    Deno.env.get('LLM_MODEL_RESUME_ADVICE') || Deno.env.get('LLM_MODEL_WHY_FIT') || 'gpt-4o-mini'
  console.log(`${LOG} calling LLM`, {
    resumeProductId,
    model,
    resumeChars: resumeText.length,
    jobDescriptionChars: jd.length,
  })
  const chat = await callChatCompletion(
    [
      { role: 'system', content: RESUME_ADVICE_SYSTEM },
      { role: 'user', content: `RESUME:\n\n${resumeText}\n\nJOB DESCRIPTION:\n\n${jd}\n` },
    ],
    { model, timeoutMs: LLM_TIMEOUT_MS },
  )
  if (!chat.ok) {
    console.warn(`${LOG} abort: LLM failed`, { resumeProductId, error: chat.error })
    await markResumeProductFailed(
      supabaseAdmin,
      resumeProductId,
      'Resume advice generation is temporarily unavailable. Please try again.',
    )
    return
  }
  const improvements = chat.content.trim()

  const completedAt = new Date().toISOString()
  const fulfillmentUpdate = {
    status: 'complete' as const,
    completed_at: completedAt,
    improvements_text: improvements,
    error_message: null,
  }
  const { error: updateError } = await supabaseAdmin
    .from('resume_products')
    .update(fulfillmentUpdate)
    .eq('id', resumeProductId)

  if (updateError) {
    console.error(`${LOG} failed to persist improvements`, {
      resumeProductId,
      message: updateError.message,
    })
    return
  }

  console.log(`${LOG} fulfill done`, {
    resumeProductId,
    productKey,
    profileId,
    improvementsChars: improvements.length,
    completedAt,
  })
}
