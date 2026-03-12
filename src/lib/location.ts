import { supabase } from '@/lib/supabase'

export interface NormalizedLocationResult {
  normalized: string | null
  error: string | null
}

export async function normalizeLocation(input: string): Promise<NormalizedLocationResult> {
  const { data, error } = await supabase.functions.invoke<NormalizedLocationResult>('normalize-location', {
    body: { input },
  })

  if (error) {
    console.error('normalizeLocation error:', error)
    return {
      normalized: null,
      error: 'We could not validate this location. Please try again.',
    }
  }

  return data ?? { normalized: null, error: null }
}

