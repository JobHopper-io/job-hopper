/**
 * Phrase-based matching for job title / industry: primary and secondary n-grams,
 * word-boundary search, per-surface weights (title, description, briefing).
 */

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

export interface MatchConfigPhraseSurfaceWeights {
  title: number
  description: number
  briefing: number
}

export interface MatchConfigPhraseWeights {
  primary: MatchConfigPhraseSurfaceWeights
  secondary: MatchConfigPhraseSurfaceWeights
  industry: MatchConfigPhraseSurfaceWeights
}

export interface MatchConfigPhraseMatching {
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

/** When true, multiply surface score by matched phrase word count. */
export const PER_WORD_MULTIPLIER = true

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True if `phrase` appears in `haystack` as whole words (case-sensitive on normalized strings). */
export function phraseMatchesAtWordBoundaries(haystack: string, phrase: string): boolean {
  const p = phrase.trim().toLowerCase()
  if (!p || !haystack) return false
  const re = new RegExp(`\\b${escapeRegex(p)}\\b`, 'i')
  return re.test(haystack)
}

function isDroppedNgram(words: string[]): boolean {
  if (words.length === 0) return true
  const first = words[0]
  const last = words[words.length - 1]
  if (END_ANCHOR_WORDS.has(first) || END_ANCHOR_WORDS.has(last)) return true
  if (words.length === 1 && STOP_WORDS.has(first)) return true
  return false
}

/** All contiguous n-grams for one comma segment (deduped). */
function ngramsForSegment(segment: string): string[] {
  const seg = segment.trim().toLowerCase()
  if (!seg) return []
  const words = seg.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 0)
  if (!words.length) return []

  const set = new Set<string>()
  const n = words.length
  for (let len = n; len >= 1; len -= 1) {
    for (let start = 0; start + len <= n; start += 1) {
      const slice = words.slice(start, start + len)
      if (isDroppedNgram(slice)) continue
      set.add(slice.join(' '))
    }
  }
  return Array.from(set)
}

function collectNgramsFromCommaField(input: string | null | undefined): string[] {
  if (!input) return []
  const all = new Set<string>()
  for (const raw of input.split(',')) {
    for (const g of ngramsForSegment(raw)) {
      all.add(g)
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
  /** Phrases that can satisfy the primary gate (length rules + non-stop singles). */
  primaryPhrases: string[]
  /** Shorter n-grams only: 2 <= len < minPrimaryWords (empty when minPrimaryWords <= 2). */
  secondaryPhrases: string[]
}

export function buildPhraseProfile(titleText: string | null, minPrimaryWords: number): PhraseProfile {
  const titleNgrams = collectNgramsFromCommaField(titleText)

  const primarySet = new Set<string>()
  const secondarySet = new Set<string>()

  const minP = Math.max(1, Math.floor(minPrimaryWords))

  for (const phrase of titleNgrams) {
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

/** Industry tier uses the same phrase lists split by length vs minPrimaryWords (rebuilt in evaluate). */
function industryTierPhrases(industryText: string | null, minPrimaryWords: number): {
  primary: string[]
  secondary: string[]
} {
  const ngrams = collectNgramsFromCommaField(industryText)
  const primary = new Set<string>()
  const secondary = new Set<string>()
  const minP = Math.max(1, Math.floor(minPrimaryWords))
  for (const phrase of ngrams) {
    const wc = phrase.split(/\s+/).length
    if (wc >= minP) primary.add(phrase)
    else if (wc >= 2 && wc < minP) secondary.add(phrase)
    else if (wc === 1 && !STOP_WORDS.has(phrase)) primary.add(phrase)
  }
  return { primary: Array.from(primary), secondary: Array.from(secondary) }
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

function scoreForMatch(
  phrase: string | null,
  weight: number,
): number {
  if (phrase == null || weight === 0) return 0
  const words = phrase.split(/\s+/).length
  return PER_WORD_MULTIPLIER ? weight * words : weight
}

export function evaluatePhraseMatch(
  prefs: PhraseMatchSubscriberInput,
  job: PhraseMatchJobSurfaces,
  phraseWeights: MatchConfigPhraseWeights,
  phraseMatching: MatchConfigPhraseMatching,
): {
  phraseScore: number
  phraseMatch: PhraseMatchDetails
  passesGate: boolean
  hasSearchIntent: boolean
} {
  const titleText = effectiveJobTitleForKeywords(prefs)
  const industryText = prefs.currentIndustry
  const minP = phraseMatching.minPrimaryWords

  const titleProfile = buildPhraseProfile(titleText, minP)
  const indTier = industryTierPhrases(industryText, minP)

  const surfaces: Record<PhraseSurface, string> = {
    title: normalizeText(job.title),
    description: normalizeText(job.description),
    briefing: normalizeText(job.aiBriefing),
  }

  const matchedBySurface: PhraseMatchDetails['matchedBySurface'] = {}
  const surfaceScores = emptySurfaceScores()

  const hasTitleIntent =
    titleProfile.primaryPhrases.length > 0 || titleProfile.secondaryPhrases.length > 0
  const industryAll = collectNgramsFromCommaField(industryText)
  const hasIndustryIntent = industryAll.length > 0

  const tiers: { key: PhraseTier; phrases: { primary: string[]; secondary: string[] } }[] = [
    { key: 'primary', phrases: { primary: titleProfile.primaryPhrases, secondary: [] } },
    { key: 'secondary', phrases: { primary: [], secondary: titleProfile.secondaryPhrases } },
    {
      key: 'industry',
      phrases: { primary: indTier.primary, secondary: indTier.secondary },
    },
  ]

  for (const tier of tiers) {
    const listPrimary = tier.phrases.primary
    const listSecondary = tier.phrases.secondary
    const weights = phraseWeights[tier.key]

    for (const surface of ['title', 'description', 'briefing'] as const) {
      const hay = surfaces[surface]
      let best: string | null = null
      if (listPrimary.length) {
        best = bestMatchOnSurface(listPrimary, hay)
      }
      if (!best && listSecondary.length) {
        best = bestMatchOnSurface(listSecondary, hay)
      }
      const w = weights[surface]
      const pts = scoreForMatch(best, w)
      surfaceScores[tier.key][surface] = pts
      if (best && pts !== 0) {
        const prev = matchedBySurface[tier.key] ?? {}
        prev[surface] = best
        matchedBySurface[tier.key] = prev
      }
    }
  }

  let phraseScore = 0
  for (const tier of ['primary', 'secondary', 'industry'] as const) {
    for (const surface of ['title', 'description', 'briefing'] as const) {
      phraseScore += surfaceScores[tier][surface]
    }
  }

  const primaryTierScore =
    surfaceScores.primary.title +
    surfaceScores.primary.description +
    surfaceScores.primary.briefing
  const industryTierScore =
    surfaceScores.industry.title +
    surfaceScores.industry.description +
    surfaceScores.industry.briefing

  // Gate uses primary + industry tiers only: title-derived secondary tier never satisfies the gate alone
  // (see plan: secondary is ranking-only). Industry matches still count when the user has title intent.
  const gateScore = primaryTierScore + industryTierScore

  let passesGate = true
  if (hasTitleIntent || hasIndustryIntent) {
    passesGate = gateScore > 0
  }

  const phraseMatch: PhraseMatchDetails = {
    primaryPhrases: titleProfile.primaryPhrases,
    secondaryPhrases: titleProfile.secondaryPhrases,
    industryPhrases: Array.from(new Set(industryAll)),
    matchedBySurface,
    surfaceScores,
  }

  const hasSearchIntent = hasTitleIntent || hasIndustryIntent

  return { phraseScore, phraseMatch, passesGate, hasSearchIntent }
}

function maxPhraseLen(phrases: string[]): number {
  if (!phrases.length) return 0
  return Math.max(...phrases.map((p) => p.split(/\s+/).length))
}

/** Upper bound on phrase contribution for admin % display. */
export function getMaxPhraseScore(
  prefs: PhraseMatchSubscriberInput,
  phraseWeights: MatchConfigPhraseWeights,
  phraseMatching: MatchConfigPhraseMatching,
): number {
  const titleText = effectiveJobTitleForKeywords(prefs)
  const profile = buildPhraseProfile(titleText, phraseMatching.minPrimaryWords)
  const ind = industryTierPhrases(prefs.currentIndustry, phraseMatching.minPrimaryWords)

  let sum = 0
  const tiers: { key: PhraseTier; primary: string[]; secondary: string[] }[] = [
    { key: 'primary', primary: profile.primaryPhrases, secondary: [] },
    { key: 'secondary', primary: [], secondary: profile.secondaryPhrases },
    { key: 'industry', primary: ind.primary, secondary: ind.secondary },
  ]

  for (const t of tiers) {
    const maxLenP = maxPhraseLen(t.primary)
    const maxLenS = maxPhraseLen(t.secondary)
    const w = phraseWeights[t.key]
    for (const surface of ['title', 'description', 'briefing'] as const) {
      const weight = w[surface]
      if (weight === 0) continue
      if (maxLenP > 0) {
        sum += PER_WORD_MULTIPLIER ? weight * maxLenP : weight
      }
      if (maxLenS > 0) {
        sum += PER_WORD_MULTIPLIER ? weight * maxLenS : weight
      }
    }
  }

  return sum
}

/** All distinct phrases for debug histograms (primary + secondary title + industry tiers). */
export function getAllProfilePhrasesForDebug(
  prefs: PhraseMatchSubscriberInput,
  phraseMatching: MatchConfigPhraseMatching,
): { phrase: string; kind: 'primary' | 'secondary' | 'industry' }[] {
  const titleText = effectiveJobTitleForKeywords(prefs)
  const profile = buildPhraseProfile(titleText, phraseMatching.minPrimaryWords)
  const ind = industryTierPhrases(prefs.currentIndustry, phraseMatching.minPrimaryWords)
  const out: { phrase: string; kind: 'primary' | 'secondary' | 'industry' }[] = []
  for (const p of profile.primaryPhrases) out.push({ phrase: p, kind: 'primary' })
  for (const p of profile.secondaryPhrases) out.push({ phrase: p, kind: 'secondary' })
  for (const p of ind.primary) out.push({ phrase: p, kind: 'industry' })
  for (const p of ind.secondary) out.push({ phrase: p, kind: 'industry' })
  return out
}
