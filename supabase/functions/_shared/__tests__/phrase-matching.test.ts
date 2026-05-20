import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildPhraseProfile,
  evaluatePhraseMatch,
  getMaxPhraseScore,
  phraseMatchesAtWordBoundaries,
  STOP_WORDS,
} from '../phrase-matching.ts'
import {
  defaultConfig,
  getMaxPossibleScore,
  mergeConfig,
  matchJobs,
  type JobRecord,
  type SubscriberPreferences,
} from '../job-matching-algorithm.ts'

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
  const cfg = mergeConfig(null)
  const r = evaluatePhraseMatch(prefs, job, cfg.phraseWeights, cfg.phraseMatching)
  assertEquals(r.passesGate, false)
  assertEquals(r.phraseScore, 0)
})

Deno.test('evaluatePhraseMatch: mechanical design engineer passes', () => {
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
  const cfg = mergeConfig(null)
  const r = evaluatePhraseMatch(prefs, job, cfg.phraseWeights, cfg.phraseMatching)
  assertEquals(r.passesGate, true)
  assertEquals(r.phraseScore > 0, true)
})

Deno.test('evaluatePhraseMatch: primary description weight 0 excludes description-only primary', () => {
  const prefs = {
    targetJobTitle: 'Mechanical Engineer',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = {
    title: 'Project Manager',
    description: 'We need a mechanical engineer for this role.',
    aiBriefing: '',
  }
  const cfg = mergeConfig({
    phraseWeights: {
      ...defaultConfig.phraseWeights,
      primary: { title: 4, description: 0, briefing: 0 },
    },
  })
  const r = evaluatePhraseMatch(prefs, job, cfg.phraseWeights, cfg.phraseMatching)
  assertEquals(r.passesGate, false)
})

Deno.test('evaluatePhraseMatch: welder one-word primary', () => {
  const prefs = {
    targetJobTitle: 'Welder',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = { title: 'Certified Welder', description: '', aiBriefing: '' }
  const cfg = mergeConfig(null)
  const r = evaluatePhraseMatch(prefs, job, cfg.phraseWeights, cfg.phraseMatching)
  assertEquals(r.passesGate, true)
})

Deno.test('evaluatePhraseMatch: multi-segment OR', () => {
  const prefs = {
    targetJobTitle: 'Software Engineer, DevOps Engineer',
    currentJobTitle: null,
    currentIndustry: null,
  }
  const job = { title: 'Senior DevOps Engineer', description: '', aiBriefing: '' }
  const cfg = mergeConfig(null)
  const r = evaluatePhraseMatch(prefs, job, cfg.phraseWeights, cfg.phraseMatching)
  assertEquals(r.passesGate, true)
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
  const cfg = mergeConfig(null)
  const r = evaluatePhraseMatch(prefs, job, cfg.phraseWeights, cfg.phraseMatching)
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
  const cfg = mergeConfig({ phraseMatching: { minPrimaryWords: 3 } })
  const r = evaluatePhraseMatch(prefs, job, cfg.phraseWeights, cfg.phraseMatching)
  assertEquals(r.phraseScore > 0, true)
  assertEquals(r.passesGate, false)
})

Deno.test('getMaxPhraseScore: industry tier counts primary or secondary per surface not both', () => {
  const prefs = {
    targetJobTitle: null,
    currentJobTitle: null,
    currentIndustry: 'Defense Systems, Aerospace',
  }
  const cfg = mergeConfig({ phraseMatching: { minPrimaryWords: 3 } })
  const maxPhrase = getMaxPhraseScore(prefs, cfg.phraseWeights, cfg.phraseMatching)
  const perfectJob = {
    title: 'Defense Systems Aerospace',
    description: 'Defense Systems Aerospace',
    aiBriefing: 'Defense Systems Aerospace',
  }
  const actual = evaluatePhraseMatch(prefs, perfectJob, cfg.phraseWeights, cfg.phraseMatching)
  assertEquals(maxPhrase >= actual.phraseScore, true)
  assertEquals(maxPhrase, actual.phraseScore)
})

Deno.test('getMaxPossibleScore is at least any included job total', () => {
  const prefs: SubscriberPreferences = {
    subscriptionTierProductKeys: ['tier_a'],
    roles: [],
    targetJobTitle: 'Mechanical Engineer',
    currentJobTitle: null,
    currentIndustry: 'Aerospace Manufacturing',
    payRangeMin: 80000,
    payRangeMax: 120000,
    preferredLocations: ['Chicago, IL'],
    openToRelocation: false,
    openToRemote: true,
    locationRadiusMiles: 25,
  }
  const cfg = mergeConfig(null)
  const maxPossible = getMaxPossibleScore(prefs, cfg)
  const job: JobRecord = {
    id: '1',
    title: 'Mechanical Design Engineer',
    companyName: 'Co',
    roleCategory: 'engineering',
    location: 'Chicago, IL',
    isRemote: false,
    description: 'Aerospace manufacturing mechanical engineer role.',
    aiBriefing: 'Aerospace manufacturing',
    applyLink: null,
    payMin: 90000,
    payMax: 110000,
    payType: 'year',
    createdAt: new Date().toISOString(),
    postedDate: new Date().toISOString(),
    subscriptionTier: 'tier_a',
  }
  const ranked = matchJobs(prefs, [job], cfg)
  assertEquals(ranked.length, 1)
  assertEquals(maxPossible >= ranked[0].score, true)
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
  const ranked = matchJobs(prefs, [job], {
    phraseWeights: {
      primary: { title: 4, description: 0, briefing: 0 },
      secondary: defaultConfig.phraseWeights.secondary,
      industry: defaultConfig.phraseWeights.industry,
    },
    phraseMatching: defaultConfig.phraseMatching,
    payWeights: defaultConfig.payWeights,
    locationWeights: defaultConfig.locationWeights,
    recencyWeights: defaultConfig.recencyWeights,
    thresholds: { ...defaultConfig.thresholds, minTotalScore: -1000 },
  })
  assertEquals(ranked.length, 0)
})
