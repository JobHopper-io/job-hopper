import type { Tables } from './database.ts'

export type MatchSynonymRow = Tables<'match_synonyms'>

/** Fields used by phrase matching (subset of row). */
export type MatchSynonymEntry = Pick<MatchSynonymRow, 'canonical' | 'aliases'>

export function matchSynonymRowsToEntries(rows: MatchSynonymRow[]): MatchSynonymEntry[] {
  return rows.map((row) => ({
    canonical: row.canonical,
    aliases: row.aliases ?? [],
  }))
}
