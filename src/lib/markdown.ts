import DOMPurify from 'dompurify'
import { marked } from 'marked'

/** Markdown → HTML safe for `v-html` (same pipeline as resume advice). */
export function markdownToSafeHtml(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || !raw.trim()) return ''
  const out = marked(raw.trim(), { async: false })
  if (typeof out !== 'string') return ''
  return DOMPurify.sanitize(out)
}
