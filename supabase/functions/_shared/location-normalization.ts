/**
 * Avoid `npm:zipcodes` in Edge Functions: resolving registry.npmjs.org often fails inside
 * local Supabase Docker (503 / "name resolution failed"). esm.sh serves a prebuilt ESM bundle.
 */
import * as zipcodes from 'https://esm.sh/zipcodes@8.0.0'
import { STATE_NAME_TO_ABBREV } from './state-abbreviations.ts'

export interface NormalizedLocationResult {
  normalized: string | null
  error: string | null
  latitude?: number | null
  longitude?: number | null
}

const STATE_ABBREVS = new Set<string>(Object.values(STATE_NAME_TO_ABBREV))

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function normalizeState(stateRaw: string): string | null {
  const cleaned = stateRaw.trim().toLowerCase()
  if (!cleaned) return null

  if (cleaned.length === 2 && /^[a-z]{2}$/.test(cleaned)) {
    const upper = cleaned.toUpperCase()
    return STATE_ABBREVS.has(upper) ? upper : null
  }

  if (!/^[a-z\s]+$/.test(cleaned)) return null
  const abbrev = STATE_NAME_TO_ABBREV[cleaned]
  return abbrev ?? null
}

export function normalizeLocationInput(raw: string | null | undefined): NormalizedLocationResult {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { normalized: null, error: null }

  // Support "City, ST ZIP" (common job posting format).
  // Example: "Hannibal, MO 63401"
  const cityStateZipMatch = trimmed.match(/^(.+),\s*([A-Za-z]{2})\s+(\d{5})$/)
  if (cityStateZipMatch) {
    const cityRaw = cityStateZipMatch[1].trim()
    const statePartRaw = cityStateZipMatch[2].trim()
    const zipRaw = cityStateZipMatch[3]

    const zipLookup = zipcodes.lookup(zipRaw)
    if (zipLookup) {
      const city = titleCase(zipLookup.city)
      const state = String(zipLookup.state || '').toUpperCase()
      if (STATE_ABBREVS.has(state)) {
        return {
          normalized: `${city}, ${state}`,
          error: null,
          latitude: zipLookup.latitude ?? null,
          longitude: zipLookup.longitude ?? null,
        }
      }
    }

    // Fallback: treat as "City, ST" and ignore ZIP for normalization.
    const stateAbbrevFromText = normalizeState(statePartRaw)
    if (!stateAbbrevFromText) {
      return { normalized: null, error: 'Please enter a valid US state or state abbreviation.' }
    }
    if (!/^[A-Za-z\s.'-]+$/.test(cityRaw)) {
      return { normalized: null, error: 'City should contain only letters and spaces.' }
    }
    const city = titleCase(cityRaw)
    const matches = zipcodes.lookupByName(city, stateAbbrevFromText)
    const coord =
      Array.isArray(matches) && matches.length > 0
        ? matches[0]
        : null

    return {
      normalized: `${city}, ${stateAbbrevFromText}`,
      error: null,
      latitude: coord?.latitude ?? null,
      longitude: coord?.longitude ?? null,
    }
  }

  const zipPattern = /^\d{5}$/
  if (zipPattern.test(trimmed)) {
    const result = zipcodes.lookup(trimmed)
    if (!result) {
      return { normalized: null, error: 'Please enter a valid US ZIP code.' }
    }
    const city = titleCase(result.city)
    const state = String(result.state || '').toUpperCase()
    if (!STATE_ABBREVS.has(state)) {
      return { normalized: null, error: 'Resolved ZIP did not map to a valid US state.' }
    }
    return {
      normalized: `${city}, ${state}`,
      error: null,
      latitude: result.latitude ?? null,
      longitude: result.longitude ?? null,
    }
  }

  if (/^\d+$/.test(trimmed)) {
    return { normalized: null, error: 'ZIP codes must be 5 digits.' }
  }

  const commaParts = trimmed.split(',')
  if (commaParts.length === 2) {
    const cityPart = commaParts[0].trim()
    const statePart = commaParts[1].trim()
    if (!cityPart || !statePart) {
      return { normalized: null, error: 'Please enter "City, State" or a ZIP code.' }
    }
    if (!/^[A-Za-z\s.'-]+$/.test(cityPart)) {
      return { normalized: null, error: 'City should contain only letters and spaces.' }
    }
    if (!/^[A-Za-z\s]+$/.test(statePart)) {
      return { normalized: null, error: 'State should contain only letters.' }
    }
    const stateAbbrev = normalizeState(statePart)
    if (!stateAbbrev) {
      return { normalized: null, error: 'Please enter a valid US state or state abbreviation.' }
    }
    const city = titleCase(cityPart)
    const matches = zipcodes.lookupByName(city, stateAbbrev)
    const coord =
      Array.isArray(matches) && matches.length > 0
        ? matches[0]
        : null

    return {
      normalized: `${city}, ${stateAbbrev}`,
      error: null,
      latitude: coord?.latitude ?? null,
      longitude: coord?.longitude ?? null,
    }
  }

  if (!/^[A-Za-z\s]+$/.test(trimmed)) {
    return {
      normalized: null,
      error: 'Please enter "City, State", a state name/abbreviation, or a 5-digit ZIP code.',
    }
  }
  const stateAbbrev = normalizeState(trimmed)
  if (!stateAbbrev) {
    return { normalized: null, error: 'Please enter a valid US state or state abbreviation.' }
  }
  return { normalized: stateAbbrev, error: null }
}

