/**
 * Phrase-based matching for job title / industry: content-aware sub-spans,
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
}

/** Articles, prepositions, conjunctions, inline symbols — never appear in generated phrases. */
export const CONNECTOR_TOKENS = new Set<string>([
  'a',
  'an',
  'the',
  'of',
  'for',
  'to',
  'with',
  'in',
  'at',
  'on',
  'by',
  'from',
  'into',
  'onto',
  'upon',
  'via',
  'per',
  'as',
  'about',
  'and',
  'or',
  'nor',
  'but',
  'also',
  'plus',
  '&',
  '+',
  '/',
  '|',
])

/** Level, rank, employment-type, academic-stage modifiers — peeled from segment edges. */
export const SENIORITY_TOKENS = new Set<string>([
  'senior',
  'sr',
  'snr',
  'junior',
  'jr',
  'jnr',
  'mid',
  'midlevel',
  'middle',
  'entry',
  'entrylevel',
  'intermediate',
  'advanced',
  'principal',
  'staff',
  'lead',
  'chief',
  'head',
  'deputy',
  'assistant',
  'associate',
  'vp',
  'svp',
  'evp',
  'avp',
  'vice',
  'president',
  'founder',
  'cofounder',
  'executive',
  'exec',
  'director',
  'ceo',
  'cto',
  'cfo',
  'coo',
  'cio',
  'cmo',
  'cso',
  'cpo',
  'cro',
  'chro',
  'ciso',
  'intern',
  'internship',
  'apprentice',
  'apprenticeship',
  'trainee',
  'traineeship',
  'student',
  'grad',
  'graduate',
  'postgrad',
  'postdoc',
  'masters',
  'bachelors',
  'phd',
  'doctoral',
  'doctorate',
  'temp',
  'temporary',
  'contract',
  'contractor',
  'permanent',
  'perm',
  'seasonal',
  'summer',
  'freelance',
  'freelancer',
  'parttime',
  'fulltime',
  'pt',
  'ft',
  'casual',
  'volunteer',
  'i',
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'vii',
  'viii',
  'ix',
  'x',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'level',
  'l1',
  'l2',
  'l3',
  'l4',
  'l5',
  'l6',
  'l7',
  'l8',
  'ic1',
  'ic2',
  'ic3',
  'ic4',
  'ic5',
  'ic6',
  'ic7',
  'e3',
  'e4',
  'e5',
  'e6',
  'e7',
  'e8',
  'p1',
  'p2',
  'p3',
  'p4',
  'p5',
  'p6',
  'p7',
  'p8',
  't1',
  't2',
  't3',
  't4',
  't5',
  't6',
  't7',
  't8',
  't9',
  't10',
])

/** Generic role nouns — dropped as standalone unigrams; allowed inside multi-word phrases. */
export const GENERIC_OCCUPATION_TOKENS = new Set<string>([
  'engineer',
  'engineering',
  'developer',
  'dev',
  'analyst',
  'analytics',
  'manager',
  'management',
  'mgr',
  'technician',
  'tech',
  'specialist',
  'consultant',
  'consulting',
  'coordinator',
  'representative',
  'rep',
  'agent',
  'administrator',
  'supervisor',
  'professional',
  'worker',
  'personnel',
  'operator',
  'clerk',
  'secretary',
  'aide',
  'helper',
  'attendant',
  'expert',
  'generalist',
  'liaison',
])

/** Union of seniority + generic occupation tokens (tests). */
export const STOP_WORDS = new Set<string>([...SENIORITY_TOKENS, ...GENERIC_OCCUPATION_TOKENS])

function isConnectorToken(token: string): boolean {
  return CONNECTOR_TOKENS.has(token)
}

function isSeniorityToken(token: string): boolean {
  return SENIORITY_TOKENS.has(token)
}

function isGenericOccupationToken(token: string): boolean {
  return GENERIC_OCCUPATION_TOKENS.has(token)
}

function isContentToken(token: string): boolean {
  return !isConnectorToken(token) && !isSeniorityToken(token) && !isGenericOccupationToken(token)
}

function allTokensNonContent(tokens: string[]): boolean {
  if (tokens.length === 0) return true
  return tokens.every(
    (t) => isConnectorToken(t) || isSeniorityToken(t) || isGenericOccupationToken(t),
  )
}

/** Normalize text for phrase building and matching (& → and, hyphens → space, etc.). */
export function normalizeForPhraseMatching(value: string | null | undefined): string {
  let s = (value ?? '').toLowerCase()
  s = s.replace(/[''`]/g, '')
  s = s.replace(/[()[\]{}"]/g, ' ')
  s = s.replace(/&/g, ' and ')
  s = s.replace(/[-–—/|+]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function normalizeText(value: string | null | undefined): string {
  return normalizeForPhraseMatching(value)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildPhraseRegex(normalizedPhrase: string): RegExp {
  return new RegExp(`\\b${escapeRegex(normalizedPhrase)}\\b`, 'i')
}

/** Pre-checked variant: both inputs already normalized (no allocation). */
function phraseMatchesNormalized(
  normalizedHaystack: string,
  normalizedPhrase: string,
  regex: RegExp,
): boolean {
  if (!normalizedPhrase || !normalizedHaystack) return false
  return regex.test(normalizedHaystack)
}

/** True if `phrase` appears in `haystack` as whole words (case-insensitive on normalized strings). */
export function phraseMatchesAtWordBoundaries(haystack: string, phrase: string): boolean {
  const p = normalizeForPhraseMatching(phrase)
  const h = normalizeForPhraseMatching(haystack)
  if (!p || !h) return false
  return buildPhraseRegex(p).test(h)
}

function tokenizeNormalized(normalized: string): string[] {
  if (!normalized) return []
  return normalized.split(/\s+/).filter((w) => w.length > 0)
}

function peelSeniorityFromEdges(tokens: string[]): string[] {
  const out = [...tokens]
  while (out.length > 0 && isSeniorityToken(out[0])) {
    out.shift()
  }
  while (out.length > 0 && isSeniorityToken(out[out.length - 1])) {
    out.pop()
  }
  return out
}

/** Split token list on CONNECTOR tokens into sub-segments (connectors omitted). */
function splitOnConnectors(tokens: string[]): string[][] {
  const segments: string[][] = []
  let current: string[] = []
  for (const token of tokens) {
    if (isConnectorToken(token)) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
      continue
    }
    current.push(token)
  }
  if (current.length > 0) segments.push(current)
  return segments
}

function addPhraseVariants(
  set: Set<string>,
  normalizedPhrase: string,
  rawSegment: string,
): void {
  if (!normalizedPhrase) return
  set.add(normalizedPhrase)
  const rawLower = rawSegment.trim().toLowerCase()
  if (rawLower.includes('&')) {
    const ampForm = normalizedPhrase.replace(/ and /g, ' & ')
    if (ampForm !== normalizedPhrase) set.add(ampForm)
  }
}

function generatePrimaryNgramsFromPeeled(peeled: string[], primarySet: Set<string>): void {
  if (peeled.length < 2) return
  for (let len = 2; len <= peeled.length; len++) {
    for (let start = 0; start <= peeled.length - len; start++) {
      const slice = peeled.slice(start, start + len)
      if (allTokensNonContent(slice)) continue
      primarySet.add(slice.join(' '))
    }
  }
}

export interface SegmentPhraseBuildOptions {
  emitDiscriminating: boolean
  includeFullSegmentPrimary: boolean
}

export interface SegmentPhraseBuildResult {
  primary: string[]
  discriminating: string[]
}

/** Sub-spans + optional discriminating unigrams from one comma segment. */
export function buildPhrasesFromSegment(
  rawSegment: string,
  options: SegmentPhraseBuildOptions,
): SegmentPhraseBuildResult {
  const trimmed = rawSegment.trim()
  if (!trimmed) return { primary: [], discriminating: [] }

  const normalized = normalizeForPhraseMatching(trimmed)
  if (!normalized) return { primary: [], discriminating: [] }

  const primarySet = new Set<string>()
  const discriminatingSet = new Set<string>()

  if (options.includeFullSegmentPrimary) {
    addPhraseVariants(primarySet, normalized, trimmed)
  }

  const tokens = tokenizeNormalized(normalized)
  const subSegments = splitOnConnectors(tokens)

  for (const subTokens of subSegments) {
    const peeled = peelSeniorityFromEdges(subTokens)
    if (peeled.length === 0) continue

    if (peeled.length === 1) {
      const t = peeled[0]
      if (isContentToken(t)) {
        if (options.emitDiscriminating) {
          discriminatingSet.add(t)
        } else {
          primarySet.add(t)
        }
      }
      continue
    }

    generatePrimaryNgramsFromPeeled(peeled, primarySet)
  }

  return {
    primary: Array.from(primarySet),
    discriminating: Array.from(discriminatingSet),
  }
}

function collectPhrasesFromCommaField(
  input: string | null | undefined,
  emitDiscriminating: boolean,
): { primary: string[]; discriminating: string[] } {
  if (!input) return { primary: [], discriminating: [] }
  const rawParts = input.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  const primarySet = new Set<string>()
  const discriminatingSet = new Set<string>()

  for (const raw of rawParts) {
    const built = buildPhrasesFromSegment(raw, {
      emitDiscriminating,
      includeFullSegmentPrimary: true,
    })
    for (const p of built.primary) primarySet.add(p)
    for (const d of built.discriminating) discriminatingSet.add(d)
  }

  return {
    primary: Array.from(primarySet),
    discriminating: Array.from(discriminatingSet),
  }
}

/** Distinct profile phrases from a comma-separated field (for debug / intent checks). */
export function phrasesFromCommaField(
  input: string | null | undefined,
  emitDiscriminating = true,
): string[] {
  const built = collectPhrasesFromCommaField(input, emitDiscriminating)
  return [...built.primary, ...built.discriminating]
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
  /** Title-only discriminating unigrams (content words peeled from segments). */
  discriminatingPhrases: string[]
}

function longestPhraseWordCount(phrases: string[]): number {
  let max = 0
  for (const phrase of phrases) {
    const wc = phrase.split(/\s+/).filter(Boolean).length
    if (wc > max) max = wc
  }
  return max
}

export function buildPhraseProfile(titleText: string | null): PhraseProfile {
  const built = collectPhrasesFromCommaField(titleText, true)
  return {
    primaryPhrases: built.primary,
    discriminatingPhrases: built.discriminating,
  }
}

function industryTierPhrases(industryText: string | null): string[] {
  return collectPhrasesFromCommaField(industryText, false).primary
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

export type PhraseTier = 'primary' | 'discriminating' | 'industry'
export type PhraseSurface = 'title' | 'description' | 'briefing'

export interface PhraseMatchDetails {
  primaryPhrases: string[]
  discriminatingPhrases: string[]
  industryPhrases: string[]
  matchedBySurface: {
    primary?: Partial<Record<PhraseSurface, string>>
    discriminating?: Partial<Record<PhraseSurface, string>>
    industry?: Partial<Record<PhraseSurface, string>>
  }
  surfaceScores: {
    primary: Record<PhraseSurface, number>
    discriminating: Record<PhraseSurface, number>
    industry: Record<PhraseSurface, number>
  }
}

function emptySurfaceScores(): PhraseMatchDetails['surfaceScores'] {
  return {
    primary: { title: 0, description: 0, briefing: 0 },
    discriminating: { title: 0, description: 0, briefing: 0 },
    industry: { title: 0, description: 0, briefing: 0 },
  }
}

interface CompiledPhrase {
  phrase: string
  regex: RegExp
  wordCount: number
}

function compilePhraseList(phrases: string[]): CompiledPhrase[] {
  const out: CompiledPhrase[] = []
  const seen = new Set<string>()
  for (const phrase of phrases) {
    const trimmed = phrase.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push({
      phrase: trimmed,
      regex: buildPhraseRegex(trimmed),
      wordCount: trimmed.split(/\s+/).filter(Boolean).length,
    })
  }
  return out
}

/** Relevance factor from matched length vs subscriber's longest primary phrase (not a fixed constant). */
function specificityScore(matchedWordCount: number, longestSubscriberPrimaryWords: number): number {
  const target = Math.max(1, longestSubscriberPrimaryWords)
  return Math.min(1, matchedWordCount / target)
}

function tierMatchRelevance(
  phrase: string | null,
  wordCount: number,
  tierFactor: number,
  longestSubscriberPrimaryWords: number,
): number {
  if (phrase == null || tierFactor <= 0) return 0
  return Math.min(1, tierFactor * specificityScore(wordCount, longestSubscriberPrimaryWords))
}

function matchBestPhraseCompiled(
  normalizedHaystack: string,
  compiled: CompiledPhrase[],
  tierFactor: number,
  longestPrimaryWords: number,
): { relevance: number; matchedPhrase: string | null } {
  if (compiled.length === 0 || !normalizedHaystack) {
    return { relevance: 0, matchedPhrase: null }
  }
  let best: CompiledPhrase | null = null
  for (const entry of compiled) {
    if (!phraseMatchesNormalized(normalizedHaystack, entry.phrase, entry.regex)) continue
    if (best == null || entry.wordCount > best.wordCount) {
      best = entry
    }
  }
  if (best == null) return { relevance: 0, matchedPhrase: null }
  return {
    relevance: tierMatchRelevance(best.phrase, best.wordCount, tierFactor, longestPrimaryWords),
    matchedPhrase: best.phrase,
  }
}

/**
 * Subscriber-side phrase work hoisted out of the per-job loop:
 * builds profile, expands synonyms, precompiles regex+wordCount per phrase.
 *
 * Build once per match run (per subscriber) and reuse across all jobs via
 * {@link evaluatePhraseMatchWithContext}.
 */
export interface PhraseEvaluationContext {
  phraseConfig: MatchConfigPhrase
  primaryPhrases: string[]
  discriminatingPhrases: string[]
  industryPhrases: string[]
  titlePrimaryCompiled: CompiledPhrase[]
  titleDiscriminatingCompiled: CompiledPhrase[]
  industryPrimaryCompiled: CompiledPhrase[]
  longestTitlePrimary: number
  longestIndustryPrimary: number
  hasTitleIntent: boolean
  hasIndustryIntent: boolean
  hasSearchIntent: boolean
}

export function buildPhraseEvaluationContext(
  prefs: PhraseMatchSubscriberInput,
  phraseConfig: MatchConfigPhrase,
  synonyms: MatchSynonymEntry[] = [],
): PhraseEvaluationContext {
  const titleText = effectiveJobTitleForKeywords(prefs)
  const industryText = prefs.currentIndustry

  const titleProfile = buildPhraseProfile(titleText)
  const industryPrimaryPhrases = industryTierPhrases(industryText)

  const titlePrimaryExpanded = expandPhrasesForMatching(titleProfile.primaryPhrases, synonyms)
  const titleDiscriminatingExpanded = expandPhrasesForMatching(
    titleProfile.discriminatingPhrases,
    synonyms,
  )
  const industryPrimaryExpanded = expandPhrasesForMatching(industryPrimaryPhrases, synonyms)

  const hasTitleIntent =
    titleProfile.primaryPhrases.length > 0 || titleProfile.discriminatingPhrases.length > 0
  const hasIndustryIntent = industryPrimaryPhrases.length > 0

  return {
    phraseConfig,
    primaryPhrases: titleProfile.primaryPhrases,
    discriminatingPhrases: titleProfile.discriminatingPhrases,
    industryPhrases: Array.from(new Set(industryPrimaryPhrases)),
    titlePrimaryCompiled: compilePhraseList(titlePrimaryExpanded),
    titleDiscriminatingCompiled: compilePhraseList(titleDiscriminatingExpanded),
    industryPrimaryCompiled: compilePhraseList(industryPrimaryExpanded),
    longestTitlePrimary: longestPhraseWordCount(titleProfile.primaryPhrases),
    longestIndustryPrimary: longestPhraseWordCount(industryPrimaryPhrases),
    hasTitleIntent,
    hasIndustryIntent,
    hasSearchIntent: hasTitleIntent || hasIndustryIntent,
  }
}

export function evaluatePhraseMatchWithContext(
  ctx: PhraseEvaluationContext,
  job: PhraseMatchJobSurfaces,
): {
  phraseRelevance: number
  phraseMatch: PhraseMatchDetails
  passesGate: boolean
  hasSearchIntent: boolean
} {
  const sw = ctx.phraseConfig.surfaceWeights
  const tf = ctx.phraseConfig.tierFactors

  const surfaces: Record<PhraseSurface, string> = {
    title: normalizeText(job.title),
    description: normalizeText(job.description),
    briefing: normalizeText(job.aiBriefing),
  }

  const matchedBySurface: PhraseMatchDetails['matchedBySurface'] = {}
  const surfaceScores = emptySurfaceScores()

  let phraseRelevance = 0
  let hasPrimaryOrIndustryMatch = false
  let discMatchedOnTitleSurface = false

  for (const surface of ['title', 'description', 'briefing'] as const) {
    const surfaceWeight = sw[surface]
    if (surfaceWeight <= 0) continue
    const hay = surfaces[surface]
    if (!hay) continue

    const primaryResult = matchBestPhraseCompiled(
      hay,
      ctx.titlePrimaryCompiled,
      tf.primary,
      ctx.longestTitlePrimary,
    )
    surfaceScores.primary[surface] = primaryResult.relevance
    if (primaryResult.matchedPhrase) {
      const prev = matchedBySurface.primary ?? {}
      prev[surface] = primaryResult.matchedPhrase
      matchedBySurface.primary = prev
      if (primaryResult.relevance > 0) hasPrimaryOrIndustryMatch = true
    }

    const discriminatingResult =
      surface === 'title'
        ? matchBestPhraseCompiled(
            hay,
            ctx.titleDiscriminatingCompiled,
            tf.secondary,
            ctx.longestTitlePrimary,
          )
        : { relevance: 0, matchedPhrase: null }

    surfaceScores.discriminating[surface] = discriminatingResult.relevance
    if (discriminatingResult.matchedPhrase) {
      const prev = matchedBySurface.discriminating ?? {}
      prev[surface] = discriminatingResult.matchedPhrase
      matchedBySurface.discriminating = prev
      if (discriminatingResult.relevance > 0) {
        discMatchedOnTitleSurface = true
      }
    }

    const industryResult = matchBestPhraseCompiled(
      hay,
      ctx.industryPrimaryCompiled,
      tf.industry,
      ctx.longestIndustryPrimary,
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
      discriminatingResult.relevance,
      industryResult.relevance,
    )
    phraseRelevance += surfaceWeight * surfaceRel
  }

  phraseRelevance = Math.min(1, Math.max(0, phraseRelevance))

  let passesGate = true
  if (ctx.hasSearchIntent) {
    passesGate = hasPrimaryOrIndustryMatch || discMatchedOnTitleSurface
  }

  const phraseMatch: PhraseMatchDetails = {
    primaryPhrases: ctx.primaryPhrases,
    discriminatingPhrases: ctx.discriminatingPhrases,
    industryPhrases: ctx.industryPhrases,
    matchedBySurface,
    surfaceScores,
  }

  return {
    phraseRelevance,
    phraseMatch,
    passesGate,
    hasSearchIntent: ctx.hasSearchIntent,
  }
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
  const ctx = buildPhraseEvaluationContext(prefs, phraseConfig, synonyms)
  return evaluatePhraseMatchWithContext(ctx, job)
}

export type ProfilePhraseDebugKind = 'primary' | 'discriminating' | 'industry'

/** All distinct phrases for debug histograms. */
export function getAllProfilePhrasesForDebug(
  prefs: PhraseMatchSubscriberInput,
): { phrase: string; kind: ProfilePhraseDebugKind }[] {
  const titleText = effectiveJobTitleForKeywords(prefs)
  const profile = buildPhraseProfile(titleText)
  const industryPhrases = industryTierPhrases(prefs.currentIndustry)
  const out: { phrase: string; kind: ProfilePhraseDebugKind }[] = []
  for (const p of profile.primaryPhrases) out.push({ phrase: p, kind: 'primary' })
  for (const p of profile.discriminatingPhrases) out.push({ phrase: p, kind: 'discriminating' })
  for (const p of industryPhrases) out.push({ phrase: p, kind: 'industry' })
  return out
}
