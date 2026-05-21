/**
 * Phrase-based matching for job title / industry: comma-segment phrases,
 * word-boundary search, subscriber-relative relevance, optional synonym expansion.
 */

import type { MatchSynonymEntry } from './match-synonym-row.ts'

export type { MatchSynonymEntry }

export interface PhraseMatchSubscriberInput {
  targetJobTitle: string | null
  currentJobTitle: string | null
  currentIndustry: string | null
}

export interface PhraseMatchJobSurfaces {
  title: string | null
  description: string | null
  aiBriefing: string | null
}

export interface MatchConfigPhrase {
  tierFactors: { primary: number; industry: number; secondary: number }
  surfaceWeights: { title: number; description: number; briefing: number }
  minPrimaryWords: number
}

/** Merged stop list: former auxiliary-only singles + generic occupation tokens. */
export const STOP_WORDS = new Set<string>([
  'senior',
  'jr',
  'junior',
  'sr',
  'mid',
  'middle',
  'temp',
  'temporary',
  'vp',
  'staff',
  'executive',
  'director',
  'student',
  'masters',
  'engineer',
  'engineering',
  'developer',
  'analyst',
  'manager',
  'management',
  'technician',
  'specialist',
  'consultant',
  'coordinator',
  'associate',
  'lead',
  'principal',
])

const END_ANCHOR_WORDS = new Set<string>(['&', 'and'])

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True if `phrase` appears in `haystack` as whole words (case-insensitive on normalized strings). */
export function phraseMatchesAtWordBoundaries(haystack: string, phrase: string): boolean {
  const p = phrase.trim().toLowerCase()
  if (!p || !haystack) return false
  const re = new RegExp(`\\b${escapeRegex(p)}\\b`, 'i')
  return re.test(haystack)
}

function isDroppedSegment(words: string[]): boolean {
  if (words.length === 0) return true
  const first = words[0]
  const last = words[words.length - 1]
  if (END_ANCHOR_WORDS.has(first) || END_ANCHOR_WORDS.has(last)) return true
  if (words.length === 1 && STOP_WORDS.has(first)) return true
  return false
}

/**
 * Phrases from one comma segment: the full segment only (no sub-span n-grams).
 * Single-word stop-word segments are dropped unless this is the user's only segment in the field.
 */
function phrasesForSegment(segment: string, soleUserSegmentInField: boolean): string[] {
  const seg = segment.trim().toLowerCase()
  if (!seg) return []
  const words = seg.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 0)
  if (!words.length) return []
  if (isDroppedSegment(words)) {
    if (soleUserSegmentInField) {
      return [words.join(' ')]
    }
    return []
  }
  return [words.join(' ')]
}

/** Distinct phrases from a comma-separated field (full segments + true unigrams only). */
export function phrasesFromCommaField(input: string | null | undefined): string[] {
  if (!input) return []
  const rawParts = input.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  const soleUserSegmentInField = rawParts.length === 1
  const all = new Set<string>()
  for (const raw of rawParts) {
    for (const p of phrasesForSegment(raw, soleUserSegmentInField)) {
      all.add(p)
    }
  }
  return Array.from(all)
}

export function effectiveJobTitleForKeywords(prefs: PhraseMatchSubscriberInput): string | null {
  const target = (prefs.targetJobTitle ?? '').trim()
  if (target.length > 0) return target
  const current = prefs.currentJobTitle
  if (current == null) return null
  return String(current).trim().length > 0 ? String(current).trim() : null
}

export interface PhraseProfile {
  primaryPhrases: string[]
  secondaryPhrases: string[]
}

function longestPhraseWordCount(phrases: string[]): number {
  let max = 0
  for (const phrase of phrases) {
    const wc = phrase.split(/\s+/).filter(Boolean).length
    if (wc > max) max = wc
  }
  return max
}

function bucketPhrasesByMinPrimaryWords(
  phrases: string[],
  minPrimaryWords: number,
): PhraseProfile {
  const primarySet = new Set<string>()
  const secondarySet = new Set<string>()
  const minP = Math.max(1, Math.floor(minPrimaryWords))
  const soleUserIntentInField = phrases.length === 1

  for (const phrase of phrases) {
    if (soleUserIntentInField) {
      primarySet.add(phrase)
      continue
    }
    const wc = phrase.split(/\s+/).length
    if (wc >= minP) {
      primarySet.add(phrase)
    } else if (wc >= 2 && wc < minP) {
      secondarySet.add(phrase)
    } else if (wc === 1 && !STOP_WORDS.has(phrase)) {
      primarySet.add(phrase)
    }
  }

  return {
    primaryPhrases: Array.from(primarySet),
    secondaryPhrases: Array.from(secondarySet),
  }
}

export function buildPhraseProfile(titleText: string | null, minPrimaryWords: number): PhraseProfile {
  return bucketPhrasesByMinPrimaryWords(phrasesFromCommaField(titleText), minPrimaryWords)
}

function industryTierPhrases(industryText: string | null, minPrimaryWords: number): {
  primary: string[]
  secondary: string[]
} {
  const bucket = bucketPhrasesByMinPrimaryWords(phrasesFromCommaField(industryText), minPrimaryWords)
  return { primary: bucket.primaryPhrases, secondary: bucket.secondaryPhrases }
}

/** Expand phrase lists with canonical forms and aliases for matching (not for gate length rules). */
export function expandPhrasesForMatching(
  phrases: string[],
  synonyms: MatchSynonymEntry[],
): string[] {
  if (phrases.length === 0) return []
  const out = new Set(phrases.map((p) => p.trim().toLowerCase()).filter((p) => p.length > 0))
  if (synonyms.length === 0) return Array.from(out)

  const aliasToCanonical = new Map<string, string>()
  const canonicalToAliases = new Map<string, string[]>()

  for (const row of synonyms) {
    const c = row.canonical.trim().toLowerCase()
    if (!c) continue
    aliasToCanonical.set(c, c)
    const als = row.aliases
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length > 0)
    canonicalToAliases.set(c, als)
    for (const a of als) {
      aliasToCanonical.set(a, c)
    }
  }

  for (const phrase of [...out]) {
    const canonical = aliasToCanonical.get(phrase) ??
      (canonicalToAliases.has(phrase) ? phrase : null)
    if (!canonical) continue
    out.add(canonical)
    for (const a of canonicalToAliases.get(canonical) ?? []) {
      out.add(a)
    }
  }

  return Array.from(out)
}

export type PhraseTier = 'primary' | 'secondary' | 'industry'
export type PhraseSurface = 'title' | 'description' | 'briefing'

export interface PhraseMatchDetails {
  primaryPhrases: string[]
  secondaryPhrases: string[]
  industryPhrases: string[]
  matchedBySurface: {
    primary?: Partial<Record<PhraseSurface, string>>
    secondary?: Partial<Record<PhraseSurface, string>>
    industry?: Partial<Record<PhraseSurface, string>>
  }
  surfaceScores: {
    primary: Record<PhraseSurface, number>
    secondary: Record<PhraseSurface, number>
    industry: Record<PhraseSurface, number>
  }
}

function emptySurfaceScores(): PhraseMatchDetails['surfaceScores'] {
  return {
    primary: { title: 0, description: 0, briefing: 0 },
    secondary: { title: 0, description: 0, briefing: 0 },
    industry: { title: 0, description: 0, briefing: 0 },
  }
}

function bestMatchOnSurface(phrases: string[], haystack: string): string | null {
  if (!haystack || phrases.length === 0) return null
  let best: string | null = null
  let bestLen = -1
  for (const phrase of phrases) {
    if (phraseMatchesAtWordBoundaries(haystack, phrase)) {
      const len = phrase.split(/\s+/).length
      if (len > bestLen) {
        bestLen = len
        best = phrase
      }
    }
  }
  return best
}

/** Relevance factor from matched length vs subscriber's longest primary phrase (not a fixed constant). */
function specificityScore(matchedWordCount: number, longestSubscriberPrimaryWords: number): number {
  const target = Math.max(1, longestSubscriberPrimaryWords)
  return Math.min(1, matchedWordCount / target)
}

function tierMatchRelevance(
  phrase: string | null,
  tierFactor: number,
  longestSubscriberPrimaryWords: number,
): number {
  if (phrase == null || tierFactor <= 0) return 0
  const words = phrase.split(/\s+/).length
  return Math.min(1, tierFactor * specificityScore(words, longestSubscriberPrimaryWords))
}

function surfaceAggregateRelevance(
  haystack: string,
  listPrimary: string[],
  listSecondary: string[],
  tierFactorPrimary: number,
  tierFactorSecondary: number,
  longestPrimaryWords: number,
  longestSecondaryWords: number,
): { relevance: number; matchedPhrase: string | null; tier: PhraseTier | null } {
  let bestPrimary: string | null = null
  if (listPrimary.length) {
    bestPrimary = bestMatchOnSurface(listPrimary, haystack)
  }
  let bestSecondary: string | null = null
  if (!bestPrimary && listSecondary.length) {
    bestSecondary = bestMatchOnSurface(listSecondary, haystack)
  }

  const primaryRel = tierMatchRelevance(bestPrimary, tierFactorPrimary, longestPrimaryWords)
  const secondaryRel = tierMatchRelevance(
    bestSecondary,
    tierFactorSecondary,
    Math.max(1, longestSecondaryWords),
  )
  const relevance = Math.max(primaryRel, secondaryRel)

  if (relevance <= 0) return { relevance: 0, matchedPhrase: null, tier: null }
  if (primaryRel >= secondaryRel && bestPrimary) {
    return { relevance, matchedPhrase: bestPrimary, tier: 'primary' }
  }
  if (bestSecondary) {
    return { relevance, matchedPhrase: bestSecondary, tier: 'secondary' }
  }
  return { relevance, matchedPhrase: bestPrimary, tier: 'primary' }
}

/** True when every title primary phrase is a single non-stop word. */
function hasOnlySingleWordTitlePrimaries(primaryPhrases: string[]): boolean {
  if (primaryPhrases.length === 0) return false
  return primaryPhrases.every((p) => p.split(/\s+/).filter(Boolean).length === 1)
}

export function evaluatePhraseMatch(
  prefs: PhraseMatchSubscriberInput,
  job: PhraseMatchJobSurfaces,
  phraseConfig: MatchConfigPhrase,
  synonyms: MatchSynonymEntry[] = [],
): {
  phraseRelevance: number
  phraseMatch: PhraseMatchDetails
  passesGate: boolean
  hasSearchIntent: boolean
} {
  const titleText = effectiveJobTitleForKeywords(prefs)
  const industryText = prefs.currentIndustry
  const minP = phraseConfig.minPrimaryWords

  const titleProfile = buildPhraseProfile(titleText, minP)
  const indTier = industryTierPhrases(industryText, minP)

  const titlePrimaryMatch = expandPhrasesForMatching(titleProfile.primaryPhrases, synonyms)
  const titleSecondaryMatch = expandPhrasesForMatching(titleProfile.secondaryPhrases, synonyms)
  const industryPrimaryMatch = expandPhrasesForMatching(indTier.primary, synonyms)
  const industrySecondaryMatch = expandPhrasesForMatching(indTier.secondary, synonyms)

  const longestTitlePrimary = longestPhraseWordCount(titleProfile.primaryPhrases)
  const longestTitleSecondary = longestPhraseWordCount(titleProfile.secondaryPhrases)
  const longestIndustryPrimary = longestPhraseWordCount(indTier.primary)
  const longestIndustrySecondary = longestPhraseWordCount(indTier.secondary)

  const surfaces: Record<PhraseSurface, string> = {
    title: normalizeText(job.title),
    description: normalizeText(job.description),
    briefing: normalizeText(job.aiBriefing),
  }

  const matchedBySurface: PhraseMatchDetails['matchedBySurface'] = {}
  const surfaceScores = emptySurfaceScores()

  const hasTitleIntent =
    titleProfile.primaryPhrases.length > 0 || titleProfile.secondaryPhrases.length > 0
  const industryAll = phrasesFromCommaField(industryText)
  const hasIndustryIntent = industryAll.length > 0

  const singleWordTitlePrimaryOnly = hasOnlySingleWordTitlePrimaries(titleProfile.primaryPhrases)

  const sw = phraseConfig.surfaceWeights
  const tf = phraseConfig.tierFactors

  let phraseRelevance = 0
  let hasPrimaryOrIndustryMatch = false
  let titlePrimaryMatchedOnTitleSurface = false

  for (const surface of ['title', 'description', 'briefing'] as const) {
    const hay = surfaces[surface]
    const surfaceWeight = sw[surface]
    if (surfaceWeight <= 0) continue

    const primaryResult = surfaceAggregateRelevance(
      hay,
      titlePrimaryMatch,
      [],
      tf.primary,
      0,
      longestTitlePrimary,
      longestTitleSecondary,
    )
    surfaceScores.primary[surface] = primaryResult.relevance
    if (primaryResult.matchedPhrase) {
      const prev = matchedBySurface.primary ?? {}
      prev[surface] = primaryResult.matchedPhrase
      matchedBySurface.primary = prev
      if (primaryResult.relevance > 0) {
        hasPrimaryOrIndustryMatch = true
        if (surface === 'title') titlePrimaryMatchedOnTitleSurface = true
      }
    }

    const secondaryResult = surfaceAggregateRelevance(
      hay,
      [],
      titleSecondaryMatch,
      0,
      tf.secondary,
      longestTitlePrimary,
      longestTitleSecondary,
    )
    surfaceScores.secondary[surface] = secondaryResult.relevance
    if (secondaryResult.matchedPhrase) {
      const prev = matchedBySurface.secondary ?? {}
      prev[surface] = secondaryResult.matchedPhrase
      matchedBySurface.secondary = prev
    }

    const industryResult = surfaceAggregateRelevance(
      hay,
      industryPrimaryMatch,
      industrySecondaryMatch,
      tf.industry,
      tf.secondary,
      longestIndustryPrimary,
      longestIndustrySecondary,
    )
    surfaceScores.industry[surface] = industryResult.relevance
    if (industryResult.matchedPhrase) {
      const prev = matchedBySurface.industry ?? {}
      prev[surface] = industryResult.matchedPhrase
      matchedBySurface.industry = prev
      if (industryResult.relevance > 0) hasPrimaryOrIndustryMatch = true
    }

    const surfaceRel = Math.max(
      primaryResult.relevance,
      secondaryResult.relevance,
      industryResult.relevance,
    )
    phraseRelevance += surfaceWeight * surfaceRel
  }

  phraseRelevance = Math.min(1, Math.max(0, phraseRelevance))

  let passesGate = true
  if (hasTitleIntent || hasIndustryIntent) {
    if (singleWordTitlePrimaryOnly && titleProfile.primaryPhrases.length > 0) {
      const industryMatched = Boolean(
        matchedBySurface.industry?.title ??
          matchedBySurface.industry?.description ??
          matchedBySurface.industry?.briefing,
      )
      passesGate = titlePrimaryMatchedOnTitleSurface || industryMatched
    } else {
      passesGate = hasPrimaryOrIndustryMatch
    }
  }

  const phraseMatch: PhraseMatchDetails = {
    primaryPhrases: titleProfile.primaryPhrases,
    secondaryPhrases: titleProfile.secondaryPhrases,
    industryPhrases: Array.from(new Set(industryAll)),
    matchedBySurface,
    surfaceScores,
  }

  const hasSearchIntent = hasTitleIntent || hasIndustryIntent

  return { phraseRelevance, phraseMatch, passesGate, hasSearchIntent }
}

/** All distinct phrases for debug histograms (primary + secondary title + industry tiers). */
export function getAllProfilePhrasesForDebug(
  prefs: PhraseMatchSubscriberInput,
  minPrimaryWords: number,
): { phrase: string; kind: 'primary' | 'secondary' | 'industry' }[] {
  const titleText = effectiveJobTitleForKeywords(prefs)
  const profile = buildPhraseProfile(titleText, minPrimaryWords)
  const ind = industryTierPhrases(prefs.currentIndustry, minPrimaryWords)
  const out: { phrase: string; kind: 'primary' | 'secondary' | 'industry' }[] = []
  for (const p of profile.primaryPhrases) out.push({ phrase: p, kind: 'primary' })
  for (const p of profile.secondaryPhrases) out.push({ phrase: p, kind: 'secondary' })
  for (const p of ind.primary) out.push({ phrase: p, kind: 'industry' })
  for (const p of ind.secondary) out.push({ phrase: p, kind: 'industry' })
  return out
}
