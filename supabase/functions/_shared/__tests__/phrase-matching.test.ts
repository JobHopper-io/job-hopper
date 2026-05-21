import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildPhraseProfile,
  evaluatePhraseMatch,
  expandPhrasesForMatching,
  phraseMatchesAtWordBoundaries,
  phrasesFromCommaField,
  STOP_WORDS,
} from '../phrase-matching.ts'
import {
  defaultConfig,
  failsPayHardFloor,
  getMaxPossibleScore,
  matchJobs,
  mergeConfig,
  type JobRecord,
  type SubscriberPreferences,
} from '../job-matching-algorithm.ts'

const phraseCfg = defaultConfig.phrase

Deno.test('phraseMatchesAtWordBoundaries rejects substring', () => {
  assertEquals(phraseMatchesAtWordBoundaries('software engineer role', 'engineer'), true)
  assertEquals(phraseMatchesAtWordBoundaries('theengineroom', 'engineer'), false)
})

Deno.test('STOP_WORDS includes engineer', () => {
  assertEquals(STOP_WORDS.has('engineer'), true)
})

Deno.test('buildPhraseProfile: mechanical engineer has primary, not lone engineer', () => {
  const p = buildPhraseProfile('Mechanical Engineer', 2)
  assertEquals(p.primaryPhrases.includes('mechanical engineer'), true)
  assertEquals(p.primaryPhrases.includes('engineer'), false)
  assertEquals(p.primaryPhrases.includes('mechanical'), false)
})

Deno.test('buildPhraseProfile: sole segment engineer is primary despite stop word', () => {
  const p = buildPhraseProfile('engineer', 2)
  assertEquals(p.primaryPhrases, ['engineer'])
  assertEquals(p.secondaryPhrases.length, 0)
})

Deno.test('phrasesFromCommaField: sole stop-word segment is kept', () => {
  assertEquals(phrasesFromCommaField('engineer'), ['engineer'])
  assertEquals(phrasesFromCommaField('engineer, mechanical engineer').includes('engineer'), false)
})

Deno.test('evaluatePhraseMatch: sole engineer intent matches engineer in job title', () => {
  const prefs = {
    targetJobTitle: 'engineer',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Software Engineer',
    description: null,
    aiBriefing: null,
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg)
  assertEquals(r.passesGate, true)
  assertEquals(r.phraseMatch.primaryPhrases, ['engineer'])
  assertEquals(r.phraseMatch.matchedBySurface.primary?.title, 'engineer')
})

Deno.test('phrasesFromCommaField: no sub-span n-grams from long title', () => {
  const phrases = phrasesFromCommaField('Senior Mechanical Design Engineer Lead')
  assertEquals(phrases.includes('senior mechanical design engineer lead'), true)
  assertEquals(phrases.includes('design'), false)
  assertEquals(phrases.includes('engineer'), false)
})

Deno.test('evaluatePhraseMatch: welder exact title reaches full primary relevance on title', () => {
  const prefs = {
    targetJobTitle: 'Welder',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Welder I',
    description: null,
    aiBriefing: null,
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg)
  assertEquals(r.passesGate, true)
  assertEquals(r.phraseMatch.surfaceScores.primary.title, 1)
})

Deno.test('evaluatePhraseMatch: welder does not pass gate on welding-only job', () => {
  const prefs = {
    targetJobTitle: 'Welder',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Welding equipment salesperson',
    description: 'Great role selling welding supplies.',
    aiBriefing: null,
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg)
  assertEquals(r.passesGate, false)
  assertEquals(r.phraseRelevance, 0)
})

Deno.test('evaluatePhraseMatch: single-word primary requires title surface not description alone', () => {
  const prefs = {
    targetJobTitle: 'Welder',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Sales Representative',
    description: 'Prior welder experience preferred.',
    aiBriefing: null,
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg)
  assertEquals(r.passesGate, false)
})

Deno.test('evaluatePhraseMatch: synonym expansion matches canonical on job', () => {
  const prefs = {
    targetJobTitle: 'RN',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Registered Nurse - ICU',
    description: null,
    aiBriefing: null,
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg, [
    { canonical: 'registered nurse', aliases: ['rn', 'r.n.'] },
  ])
  assertEquals(r.passesGate, true)
  assertEquals(r.phraseMatch.matchedBySurface.primary?.title != null, true)
})

Deno.test('expandPhrasesForMatching adds aliases for canonical phrase', () => {
  const expanded = expandPhrasesForMatching(['registered nurse'], [
    { canonical: 'registered nurse', aliases: ['rn'] },
  ])
  assertEquals(expanded.includes('registered nurse'), true)
  assertEquals(expanded.includes('rn'), true)
})

Deno.test('evaluatePhraseMatch: long title does not pass gate on single shared subword', () => {
  const prefs = {
    targetJobTitle: 'Senior Mechanical Design Engineer Lead',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Design Coordinator',
    description: null,
    aiBriefing: null,
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg)
  assertEquals(r.passesGate, false)
})

Deno.test('evaluatePhraseMatch: mechanical user vs software job fails gate', () => {
  const prefs = {
    targetJobTitle: 'Mechanical Engineer',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Software Engineer',
    description: null,
    aiBriefing: null,
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg)
  assertEquals(r.passesGate, false)
  assertEquals(r.phraseRelevance, 0)
})

Deno.test('evaluatePhraseMatch: mechanical design engineer passes with bounded relevance', () => {
  const prefs = {
    targetJobTitle: 'Mechanical Engineer',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Mechanical Design Engineer',
    description: '',
    aiBriefing: '',
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg)
  assertEquals(r.passesGate, true)
  assertEquals(r.phraseRelevance > 0, true)
  assertEquals(r.phraseRelevance <= 1, true)
})

Deno.test('evaluatePhraseMatch: relevance capped at 1 regardless of title length', () => {
  const shortPrefs = {
    targetJobTitle: 'Welder',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const longPrefs = {
    targetJobTitle: 'Senior Mechanical Design Engineer Lead',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Senior Mechanical Design Engineer Lead Role',
    description: 'Senior Mechanical Design Engineer Lead',
    aiBriefing: 'Senior Mechanical Design Engineer Lead',
  }
  const shortR = evaluatePhraseMatch(shortPrefs, job, phraseCfg)
  const longR = evaluatePhraseMatch(longPrefs, job, phraseCfg)
  assertEquals(shortR.phraseRelevance <= 1, true)
  assertEquals(longR.phraseRelevance <= 1, true)
})

Deno.test('evaluatePhraseMatch: industry tier can satisfy gate when title primary does not match', () => {
  const prefs = {
    targetJobTitle: 'Mechanical Engineer',
    currentJobTitle: null,
    currentIndustry: 'Aerospace',
  }
  const job = {
    title: 'Software Engineer',
    description: 'Work in aerospace manufacturing.',
    aiBriefing: '',
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg)
  assertEquals(r.passesGate, true)
  assertEquals(r.phraseMatch.matchedBySurface.industry?.description != null, true)
})

Deno.test('evaluatePhraseMatch: title-derived secondary tier alone does not pass gate', () => {
  const prefs = {
    targetJobTitle: 'Engineer Manager',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Engineer Manager Role',
    description: '',
    aiBriefing: '',
  }
  const cfg = mergeConfig({
    phrase: { ...phraseCfg, minPrimaryWords: 3 },
  })
  const r = evaluatePhraseMatch(prefs, job, cfg.phrase)
  assertEquals(r.phraseRelevance > 0, true)
  assertEquals(r.passesGate, false)
})

Deno.test('getMaxPossibleScore is always 100', () => {
  assertEquals(getMaxPossibleScore(), 100)
})

Deno.test('matchJobs: total score in 0-100 range with default config', () => {
  const prefs: SubscriberPreferences = {
    subscriptionTierProductKeys: ['tier_a'],
    roles: [],
    targetJobTitle: 'Mechanical Engineer',
    currentJobTitle: null,
    currentIndustry: null,
    payRangeMin: null,
    payRangeMax: null,
    preferredLocations: [],
    openToRelocation: null,
    openToRemote: null,
    locationRadiusMiles: null,
  }
  const job: JobRecord = {
    id: '1',
    title: 'Mechanical Design Engineer',
    companyName: 'Co',
    roleCategory: 'engineering',
    location: null,
    isRemote: false,
    description: null,
    aiBriefing: null,
    applyLink: null,
    payMin: null,
    payMax: null,
    payType: null,
    createdAt: new Date().toISOString(),
    postedDate: new Date().toISOString(),
    subscriptionTier: 'tier_a',
  }
  const ranked = matchJobs(prefs, [job], { thresholds: { minTotalScore: 0 } })
  assertEquals(ranked.length, 1)
  assertEquals(ranked[0].score >= 0, true)
  assertEquals(ranked[0].score <= 100, true)
})

Deno.test('matchJobs excludes when phrase gate fails', () => {
  const prefs: SubscriberPreferences = {
    subscriptionTierProductKeys: ['tier_a'],
    roles: [],
    targetJobTitle: 'Mechanical Engineer',
    currentJobTitle: null,
    currentIndustry: null,
    payRangeMin: null,
    payRangeMax: null,
    preferredLocations: [],
    openToRelocation: null,
    openToRemote: null,
    locationRadiusMiles: null,
  }
  const job: JobRecord = {
    id: '1',
    title: 'Software Engineer',
    companyName: 'Co',
    roleCategory: 'engineering',
    location: null,
    isRemote: false,
    description: null,
    aiBriefing: null,
    applyLink: null,
    payMin: null,
    payMax: null,
    payType: null,
    createdAt: new Date().toISOString(),
    postedDate: new Date().toISOString(),
    subscriptionTier: 'tier_a',
  }
  const ranked = matchJobs(prefs, [job], mergeConfig(null))
  assertEquals(ranked.length, 0)
})

Deno.test('failsPayHardFloor when enabled and job pay far below range', () => {
  const prefs: SubscriberPreferences = {
    subscriptionTierProductKeys: ['tier_a'],
    roles: [],
    targetJobTitle: null,
    currentJobTitle: null,
    currentIndustry: null,
    payRangeMin: 100000,
    payRangeMax: 120000,
    preferredLocations: [],
    openToRelocation: null,
    openToRemote: null,
    locationRadiusMiles: null,
  }
  const job: JobRecord = {
    id: '1',
    title: 'Role',
    companyName: 'Co',
    roleCategory: null,
    location: null,
    isRemote: false,
    description: null,
    aiBriefing: null,
    applyLink: null,
    payMin: 40000,
    payMax: 50000,
    payType: 'year',
    createdAt: new Date().toISOString(),
    postedDate: new Date().toISOString(),
    subscriptionTier: 'tier_a',
  }
  const cfg = mergeConfig({
    pay: { ...defaultConfig.pay, hardFloorEnabled: true, hardFloorFraction: 0.3 },
    phraseGate: { requirePrimaryOrIndustry: false },
    thresholds: { minTotalScore: 0 },
  })
  assertEquals(failsPayHardFloor(prefs, job, cfg), true)
})
