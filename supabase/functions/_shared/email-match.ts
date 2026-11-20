/** Exact case-insensitive match through PostgREST's ILIKE: escape ILIKE's own wildcards
 * so a "_" or "%" in an address matches only itself. PostgREST also reads "*" as a
 * wildcard and offers no escape for it; callers skip such (vanishingly rare) addresses. */
export function ilikeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}
