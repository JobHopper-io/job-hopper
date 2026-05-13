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

async function postN8n(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  logContext: { resumeProductId: string },
): Promise<string | null> {
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
      return null
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      console.error(`${LOG} webhook response is not JSON`, {
        resumeProductId: logContext.resumeProductId,
        rawPreview: raw.slice(0, 200),
      })
      return null
    }
    if (parsed && typeof parsed === 'object' && 'improvements' in parsed) {
      const v = (parsed as { improvements: unknown }).improvements
      if (typeof v === 'string' && v.trim()) {
        const trimmed = v.trim()
        console.log(`${LOG} webhook OK`, {
          resumeProductId: logContext.resumeProductId,
          status: res.status,
          improvementsChars: trimmed.length,
          responseBodyChars: raw.length,
        })
        return trimmed
      }
    }
    console.error(`${LOG} missing improvements string in JSON response`, {
      resumeProductId: logContext.resumeProductId,
    })
    return null
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`${LOG} webhook request failed`, {
      resumeProductId: logContext.resumeProductId,
      message,
    })
    return null
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
    return
  }

  if (isPerJobResumeProduct(productKey) && (!jobMatchId || !jobMatchId.trim())) {
    console.error(`${LOG} skip: per-job purchase missing job_match_id`, { resumeProductId, productKey })
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
    return
  }

  const bucketKey = profile.resume_bucket_key.trim()
  console.log(`${LOG} loading resume from storage`, { resumeProductId, bucketKeySuffix: bucketKey.slice(-24) })

  const bytes = await downloadResumeBytes(supabaseAdmin, bucketKey)
  if (!bytes) return

  const resumeText = await bytesToResumePlainText(bucketKey, bytes)
  if (!resumeText) {
    console.error(`${LOG} skip: could not extract plain text from resume file`, { resumeProductId, bucketKey })
    return
  }

  console.log(`${LOG} resume text extracted`, { resumeProductId, charCount: resumeText.length })

  const body: Record<string, unknown> = { resume: resumeText }

  if (isPerJobResumeProduct(productKey)) {
    const jd = await loadJobDescriptionForMatch(supabaseAdmin, profileId, jobMatchId as string)
    if (!jd) {
      console.error(`${LOG} skip: no job description for per-job resume`, { resumeProductId, jobMatchId })
      return
    }
    body.jobDescription = jd
    console.log(`${LOG} job description loaded`, { resumeProductId, charCount: jd.length })
  }

  const improvements = await postN8n(url, apiKey, body, { resumeProductId })
  if (!improvements) {
    console.warn(`${LOG} abort: no improvements from webhook`, { resumeProductId })
    return
  }

  const completedAt = new Date().toISOString()
  const fulfillmentUpdate = {
    status: 'complete' as const,
    completed_at: completedAt,
    improvements_text: improvements,
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
