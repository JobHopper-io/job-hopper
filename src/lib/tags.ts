/** Splits a comma/slash/pipe-joined field into display tags. Mirrors the matching
 * algorithm's `splitFieldAlternatives` (supabase/functions/_shared/phrase-matching.ts) so what
 * the user sees as separate tags is exactly what gets scored as separate title alternatives. */
export function splitTagsField(input: string | null | undefined): string[] {
  if (!input) return []
  return input
    .split(/[,/|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function joinTagsField(tags: string[]): string {
  return tags.join(', ')
}
