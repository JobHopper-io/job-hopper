import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

type AdminClient = SupabaseClient

/** Grep-friendly prefix for resume n8n fulfillment logs. */
const LOG = '[resume-n8n]'

const TAILORING_URL = () => Deno.env.get('N8N_RESUME_ADVICE_WEBHOOK_URL') ?? ''
const UPGRADE_URL = () => Deno.env.get('N8N_RESUME_UPGRADE_WEBHOOK_URL') ?? ''
const API_KEY = () => Deno.env.get('N8N_WEBHOOK_API_KEY') ?? ''

const FETCH_TIMEOUT_MS = 120_000

function isPerJobResumeProduct(key: string): boolean {
  return key === 'per_job_resume_advice'
}

function webhookUrlForProductKey(key: string): string | null {
  if (isPerJobResumeProduct(key)) {
    const u = TAILORING_URL()
    return u || null
  }
  if (key === 'resume_upgrade') {
    const u = UPGRADE_URL()
    return u || null
  }
  return null
}

async function downloadResumeBytes(
  supabaseAdmin: AdminClient,
  bucketKey: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.storage.from('resumes').download(bucketKey)
  if (error || !data) {
    console.error(`${LOG} storage download failed`, { bucketKey, message: error?.message })
    return null
  }
  return new Uint8Array(await data.arrayBuffer())
}

async function bytesToResumePlainText(
  bucketKey: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const lower = bucketKey.toLowerCase()
  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim() || null
  }
  if (lower.endsWith('.pdf')) {
    try {
      const { extractText } = await import('https://esm.sh/unpdf@0.12.1')
      const { text } = await extractText(bytes, { mergePages: true })
      const s = (text ?? '').trim()
      return s || null
    } catch (e) {
      console.error(`${LOG} PDF text extraction failed`, e)
      return null
    }
  }
  console.warn(`${LOG} unsupported resume file type (use PDF or TXT)`, { bucketKey })
  return null
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

function logWebhookTarget(url: string): { host: string; path: string } {
  try {
    const u = new URL(url)
    return { host: u.host, path: u.pathname }
  } catch {
    return { host: '(invalid-url)', path: '' }
  }
}

const ERROR_MESSAGE_MAX_LENGTH = 1000

/**
 * Records a terminal failure so the frontend stops waiting.
 *
 * Only reachable while the isolate is alive. When the runtime drops the worker
 * mid-await (EarlyDrop) nothing here runs, and the stale-row sweeper in
 * run-scheduled-jobs is what eventually resolves the row.
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

  // Guard on status='pending' AND return the affected row: if a late callback already
  // completed it, this matches nothing and we must NOT refund a successful generation.
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
    // Row was no longer pending (e.g. completed by the callback) — nothing to fail or refund.
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

// Three outcomes, because n8n can respond either way:
//  - complete: legacy synchronous n8n that returns the advice in the webhook response.
//  - pending:  callback architecture — n8n acks 200 immediately with no advice and
//              delivers it later to resume-advice-callback. The row must stay pending;
//              marking it failed here races (and loses to) that callback.
//  - failed:   a real, immediate failure (non-2xx or network) that no callback follows.
type PostN8nResult =
  | { kind: 'complete'; improvements: string }
  | { kind: 'pending' }
  | { kind: 'failed'; reason: string }

async function postN8n(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  logContext: { resumeProductId: string },
): Promise<PostN8nResult> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const target = logWebhookTarget(url)
  const resumeLen =
    typeof body.resume === 'string' ? body.resume.length : 0
  const jdLen =
    typeof body.jobDescription === 'string' ? body.jobDescription.length : 0
  console.log(`${LOG} POST webhook`, {
    resumeProductId: logContext.resumeProductId,
    host: target.host,
    path: target.path,
    bodyResumeChars: resumeLen,
    bodyJobDescriptionChars: jdLen,
  })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const raw = await res.text()
    if (!res.ok) {
      console.error(`${LOG} webhook HTTP error`, {
        resumeProductId: logContext.resumeProductId,
        status: res.status,
        bodyPreview: raw.slice(0, 500),
      })
      return { kind: 'failed', reason: `Resume service returned HTTP ${res.status}` }
    }
    // A 2xx immediate ack (empty or non-JSON body) is the callback path: accept it and
    // leave the row pending for resume-advice-callback to complete.
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      console.log(`${LOG} webhook acked (non-JSON body); awaiting callback`, {
        resumeProductId: logContext.resumeProductId,
      })
      return { kind: 'pending' }
    }
    if (parsed && typeof parsed === 'object' && 'improvements' in parsed) {
      const v = (parsed as { improvements: unknown }).improvements
      if (typeof v === 'string' && v.trim()) {
        const trimmed = v.trim()
        console.log(`${LOG} webhook OK (synchronous advice)`, {
          resumeProductId: logContext.resumeProductId,
          status: res.status,
          improvementsChars: trimmed.length,
          responseBodyChars: raw.length,
        })
        return { kind: 'complete', improvements: trimmed }
      }
    }
    // 2xx but no advice yet — the callback will deliver it. Not a failure.
    console.log(`${LOG} webhook acked (no synchronous advice); awaiting callback`, {
      resumeProductId: logContext.resumeProductId,
    })
    return { kind: 'pending' }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const aborted = e instanceof Error && e.name === 'AbortError'
    console.error(`${LOG} webhook request failed`, {
      resumeProductId: logContext.resumeProductId,
      aborted,
      message,
    })
    return {
      kind: 'failed',
      reason: aborted
        ? `Resume service did not respond within ${Math.round(FETCH_TIMEOUT_MS / 1000)}s`
        : `Could not reach the resume service: ${message}`,
    }
  } finally {
    clearTimeout(t)
  }
}

export type FulfillResumeN8nParams = {
  supabaseAdmin: AdminClient
  resumeProductId: string
  productKey: string
  profileId: string
  /** Required for per-job product (per_job_resume_advice) */
  jobMatchId: string | null
}

/**
 * Loads resume text, calls the appropriate n8n webhook, persists improvements on success.
 */
export async function fulfillResumeProductViaN8n(params: FulfillResumeN8nParams): Promise<void> {
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

  const url = webhookUrlForProductKey(productKey)
  const apiKey = API_KEY()
  if (!url || !apiKey) {
    console.warn(`${LOG} skip: missing env (N8N_WEBHOOK_API_KEY and product webhook URL)`, {
      resumeProductId,
      productKey,
      hasUrl: Boolean(url),
      hasKey: Boolean(apiKey),
      webhookEnv:
        productKey === 'resume_upgrade'
          ? 'N8N_RESUME_UPGRADE_WEBHOOK_URL'
          : 'N8N_RESUME_ADVICE_WEBHOOK_URL',
    })
    await markResumeProductFailed(
      supabaseAdmin,
      resumeProductId,
      'Resume service is not configured. Please contact support.',
    )
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

  // resumeProductId is echoed back by the n8n workflow to resume-advice-callback so it
  // knows which row to complete. It must survive the round-trip on every product type.
  const body: Record<string, unknown> = { resume: resumeText, resumeProductId }

  if (isPerJobResumeProduct(productKey)) {
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
    body.jobDescription = jd
    console.log(`${LOG} job description loaded`, { resumeProductId, charCount: jd.length })
  }

  const result = await postN8n(url, apiKey, body, { resumeProductId })
  if (result.kind === 'failed') {
    console.warn(`${LOG} abort: webhook failed`, { resumeProductId, reason: result.reason })
    await markResumeProductFailed(supabaseAdmin, resumeProductId, result.reason)
    return
  }
  if (result.kind === 'pending') {
    // n8n accepted the job and will POST the result to resume-advice-callback. Leave the
    // row pending; the callback completes it, or the sweeper fails it after the timeout.
    console.log(`${LOG} awaiting async callback`, { resumeProductId })
    return
  }
  const improvements = result.improvements

  // A late success outranks the sweeper: if the row was already marked failed for
  // taking too long, overwrite it and clear the stale reason.
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
