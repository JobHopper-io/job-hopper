import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type AdminClient = SupabaseClient

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
    console.error('n8n resume: storage download failed', { bucketKey, message: error?.message })
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
      console.error('n8n resume: PDF text extraction failed', e)
      return null
    }
  }
  console.warn('n8n resume: unsupported resume file type (use PDF or TXT)', { bucketKey })
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
    console.error('n8n resume: job match not found for per-job resume', {
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
    console.error('n8n resume: failed to load job description', { message: jobError.message })
    return null
  }

  const d = job?.description
  if (typeof d === 'string' && d.trim()) return d.trim()
  return null
}

async function postN8n(url: string, apiKey: string, body: Record<string, unknown>): Promise<string | null> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
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
      console.error('n8n resume: webhook HTTP error', {
        status: res.status,
        bodyPreview: raw.slice(0, 500),
      })
      return null
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      console.error('n8n resume: webhook response is not JSON', { rawPreview: raw.slice(0, 200) })
      return null
    }
    if (parsed && typeof parsed === 'object' && 'improvements' in parsed) {
      const v = (parsed as { improvements: unknown }).improvements
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    console.error('n8n resume: missing improvements string in JSON response')
    return null
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('n8n resume: webhook request failed', { message })
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

  const { data: rowState } = await supabaseAdmin
    .from('resume_products')
    .select('status')
    .eq('id', resumeProductId)
    .maybeSingle()
  if (rowState?.status === 'complete') {
    return
  }

  const url = webhookUrlForProductKey(productKey)
  const apiKey = API_KEY()
  if (!url || !apiKey) {
    console.warn('n8n resume: skip fulfillment (set N8N_WEBHOOK_API_KEY and product webhook URL)', {
      productKey,
      hasUrl: Boolean(url),
      hasKey: Boolean(apiKey),
    })
    return
  }

  if (isPerJobResumeProduct(productKey) && (!jobMatchId || !jobMatchId.trim())) {
    console.error('n8n resume: per-job purchase missing job_match_id metadata')
    return
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('resume_bucket_key')
    .eq('id', profileId)
    .maybeSingle()

  if (profileError || !profile?.resume_bucket_key?.trim()) {
    console.error('n8n resume: profile has no resume on file', {
      profileId,
      message: profileError?.message,
    })
    return
  }

  const bytes = await downloadResumeBytes(supabaseAdmin, profile.resume_bucket_key.trim())
  if (!bytes) return

  const resumeText = await bytesToResumePlainText(profile.resume_bucket_key.trim(), bytes)
  if (!resumeText) {
    console.error('n8n resume: could not extract plain text from resume file')
    return
  }

  const body: Record<string, unknown> = { resume: resumeText }

  if (isPerJobResumeProduct(productKey)) {
    const jd = await loadJobDescriptionForMatch(supabaseAdmin, profileId, jobMatchId as string)
    if (!jd) {
      console.error('n8n resume: no job description for per-job resume; skipping webhook')
      return
    }
    body.jobDescription = jd
  }

  const improvements = await postN8n(url, apiKey, body)
  if (!improvements) return

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
    console.error('n8n resume: failed to persist improvements', {
      resumeProductId,
      message: updateError.message,
    })
  }
}
