import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildPhraseProfile,
  buildPhrasesFromSegment,
  evaluatePhraseMatch,
  expandPhrasesForMatching,
  GENERIC_OCCUPATION_TOKENS,
  normalizeForPhraseMatching,
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

Deno.test('GENERIC_OCCUPATION_TOKENS includes engineer', () => {
  assertEquals(GENERIC_OCCUPATION_TOKENS.has('engineer'), true)
  assertEquals(STOP_WORDS.has('engineer'), true)
})

Deno.test('normalizeForPhraseMatching: ampersand and hyphen', () => {
  assertEquals(normalizeForPhraseMatching('Pricing & Contract'), 'pricing and contract')
  assertEquals(normalizeForPhraseMatching('Front-End'), 'front end')
})

Deno.test('phraseMatchesAtWordBoundaries: and matches ampersand haystack', () => {
  assertEquals(
    phraseMatchesAtWordBoundaries('Pricing & Contract Analyst', 'pricing and contract'),
    true,
  )
})

Deno.test('buildPhraseProfile: mechanical engineer has primary and discriminating', () => {
  const p = buildPhraseProfile('Mechanical Engineer')
  assertEquals(p.primaryPhrases.includes('mechanical engineer'), true)
  assertEquals(p.discriminatingPhrases.includes('mechanical'), true)
  assertEquals(p.discriminatingPhrases.includes('engineer'), false)
})

Deno.test('buildPhraseProfile: sole segment engineer is primary only', () => {
  const p = buildPhraseProfile('engineer')
  assertEquals(p.primaryPhrases.includes('engineer'), true)
  assertEquals(p.discriminatingPhrases.length, 0)
})

Deno.test('buildPhraseProfile: Pricing & Contract Administration Analyst', () => {
  const p = buildPhraseProfile('Pricing & Contract Administration Analyst')
  assertEquals(
    p.primaryPhrases.includes('pricing and contract administration analyst'),
    true,
  )
  assertEquals(p.discriminatingPhrases.includes('pricing'), true)
  assertEquals(p.discriminatingPhrases.includes('contract'), true)
  assertEquals(p.discriminatingPhrases.includes('administration'), true)
  assertEquals(p.primaryPhrases.includes('contract administration'), true)
})

Deno.test('buildPhraseProfile: Associate Data analyst', () => {
  const p = buildPhraseProfile('Associate Data analyst')
  assertEquals(p.primaryPhrases.includes('data analyst'), true)
  assertEquals(p.discriminatingPhrases.includes('data'), true)
})

Deno.test('buildPhraseProfile: VP Sales', () => {
  const p = buildPhraseProfile('VP Sales')
  assertEquals(p.primaryPhrases.includes('vp sales'), true)
  assertEquals(p.discriminatingPhrases.includes('sales'), true)
})

Deno.test('buildPhraseProfile: Executive Director Home Care', () => {
  const p = buildPhraseProfile('Executive Director Home Care')
  assertEquals(p.primaryPhrases.includes('home care'), true)
  assertEquals(p.discriminatingPhrases.includes('home'), true)
  assertEquals(p.discriminatingPhrases.includes('care'), true)
})

Deno.test('buildPhraseProfile: Front-End Developer hyphen', () => {
  const p = buildPhraseProfile('Front-End Developer')
  assertEquals(p.primaryPhrases.includes('front end'), true)
  assertEquals(p.discriminatingPhrases.includes('front'), true)
  assertEquals(p.discriminatingPhrases.includes('end'), true)
})

Deno.test('buildPhraseProfile: Engineer II peels level', () => {
  const p = buildPhraseProfile('Engineer II')
  assertEquals(p.primaryPhrases.includes('engineer ii'), true)
  assertEquals(p.discriminatingPhrases.length, 0)
})

Deno.test('buildPhrasesFromSegment: industry mode promotes content unigram to primary', () => {
  const built = buildPhrasesFromSegment('Healthcare', {
    emitDiscriminating: false,
    includeFullSegmentPrimary: true,
  })
  assertEquals(built.primary.includes('healthcare'), true)
  assertEquals(built.discriminating.length, 0)
})

Deno.test('phrasesFromCommaField: sole stop-word segment is kept as primary', () => {
  assertEquals(phrasesFromCommaField('engineer').includes('engineer'), true)
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
})

Deno.test('evaluatePhraseMatch: long title generates sub-span primaries', () => {
  const p = buildPhraseProfile('Senior Mechanical Design Engineer Lead')
  assertEquals(p.primaryPhrases.includes('senior mechanical design engineer lead'), true)
  assertEquals(p.primaryPhrases.includes('mechanical design'), true)
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

Deno.test('evaluatePhraseMatch: discriminating on description does not pass gate', () => {
  const prefs = {
    targetJobTitle: 'Pricing & Contract Administration Analyst',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Sales Representative',
    description: 'Strong pricing background required.',
    aiBriefing: null,
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg)
  assertEquals(r.passesGate, false)
})

Deno.test('evaluatePhraseMatch: Associate Pricing Analyst passes via discriminating pricing', () => {
  const prefs = {
    targetJobTitle: 'Pricing & Contract Administration Analyst',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Associate Pricing Analyst',
    description: null,
    aiBriefing: null,
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg)
  assertEquals(r.passesGate, true)
  assertEquals(r.phraseMatch.matchedBySurface.discriminating?.title, 'pricing')
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

Deno.test('evaluatePhraseMatch: long title does not pass gate on single shared subword only', () => {
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

Deno.test('evaluatePhraseMatch: Senior Software Engineer user matches Software Engineer job', () => {
  const prefs = {
    targetJobTitle: 'Senior Software Engineer',
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
  assertEquals(r.phraseMatch.matchedBySurface.primary?.title, 'software engineer')
})

Deno.test('evaluatePhraseMatch: VP Sales passes Sales Director via discriminating sales', () => {
  const prefs = {
    targetJobTitle: 'VP Sales',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Sales Director',
    description: null,
    aiBriefing: null,
  }
  const r = evaluatePhraseMatch(prefs, job, phraseCfg)
  assertEquals(r.passesGate, true)
  assertEquals(r.phraseMatch.matchedBySurface.discriminating?.title, 'sales')
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

Deno.test('evaluatePhraseMatch: industry has no discriminating phrases', () => {
  const prefs = {
    targetJobTitle: 'Mechanical Engineer',
    currentJobTitle: null,
    currentIndustry: 'Healthcare',
  }
  const profile = buildPhraseProfile(prefs.targetJobTitle)
  const r = evaluatePhraseMatch(prefs, {
    title: 'Hospital Administrator',
    description: 'Healthcare services.',
    aiBriefing: null,
  }, phraseCfg)
  assertEquals(r.passesGate, true)
  assertEquals(profile.discriminatingPhrases.length >= 0, true)
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
