/**
 * Supabase schema types for Edge Functions (source: regenerated `src/types/supabase.ts`).
 */
import type { Database } from '../../../src/types/supabase.ts'

export type { Database }

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]
