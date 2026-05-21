import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'
import type { Database } from './database.ts'
import {
  matchSynonymRowsToEntries,
  type MatchSynonymEntry,
} from './match-synonym-row.ts'

export async function fetchMatchSynonymsForMatching(
  client: SupabaseClient<Database>,
): Promise<MatchSynonymEntry[]> {
  const { data, error } = await client
    .from('match_synonyms')
    .select('canonical, aliases')

  if (error) {
    throw new Error(`Failed to load match_synonyms: ${error.message}`)
  }

  return matchSynonymRowsToEntries(data ?? [])
}
