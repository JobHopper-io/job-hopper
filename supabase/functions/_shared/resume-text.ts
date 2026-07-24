import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

/** Grep-friendly prefix for resume text extraction logs. */
const LOG = '[resume-text]'

/** Downloads a resume file's raw bytes from the private `resumes` storage bucket. Must be
 * called with a service-role client - storage RLS scopes uploads/reads to the owning user. */
export async function downloadResumeBytes(
  supabaseAdmin: SupabaseClient,
  bucketKey: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.storage.from('resumes').download(bucketKey)
  if (error || !data) {
    console.error(`${LOG} storage download failed`, { bucketKey, message: error?.message })
    return null
  }
  return new Uint8Array(await data.arrayBuffer())
}

/** Extracts plain text from a resume file's bytes. Supports .txt/.md (decoded directly) and
 * .pdf (via unpdf); .doc/.docx are accepted by the uploader but not handled here - returns
 * null for anything unsupported. */
export async function bytesToResumePlainText(
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

/** Convenience wrapper: download + extract in one call. Null if either step fails. */
export async function loadResumeText(
  supabaseAdmin: SupabaseClient,
  bucketKey: string,
): Promise<string | null> {
  const bytes = await downloadResumeBytes(supabaseAdmin, bucketKey)
  if (!bytes) return null
  return bytesToResumePlainText(bucketKey, bytes)
}
