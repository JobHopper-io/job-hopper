import {
  normalizeLocationInput,
  type NormalizedLocationResult,
} from '@shared/location-normalization'

export type { NormalizedLocationResult }

/**
 * Normalizes on the client using the same logic as the `normalize-location` Edge Function.
 * Avoids a round-trip to Functions (local Docker often returns 503 when Deno cannot resolve npm registry DNS).
 */
export async function normalizeLocation(input: string): Promise<NormalizedLocationResult> {
  return normalizeLocationInput(input)
}

