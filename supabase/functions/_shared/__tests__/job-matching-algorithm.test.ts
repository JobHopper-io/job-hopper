import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { JobRecord, SubscriberPreferences } from '../job-matching-algorithm.ts'
import { matchJobsWithDebug } from '../job-matching-algorithm.ts'

function baseJob(overrides: Partial<JobRecord> & Pick<JobRecord, 'id' | 'title'>): JobRecord {
  const iso = new Date().toISOString()
  return {
    companyName: 'Acme Corp',
    roleCategory: 'engineering',
    location: 'Remote',
    isRemote: true,
    description: null,
    aiBriefing: null,
    applyLink: null,
    payMin: 80_000,
    payMax: 120_000,
    payType: 'salary',
    createdAt: iso,
    postedDate: iso,
    subscriptionTier: 'tier_test',
    sponsorshipLikelihood: 'N/A',
    ...overrides,
  }
}

const prefs: SubscriberPreferences = {
  subscriptionTierProductKeys: ['tier_test'],
  roles: [],
  currentJobTitle: 'Mechanical Engineer',
  currentIndustry: null,
  payRangeMin: 60_000,
  payRangeMax: 140_000,
  preferredLocations: [],
  openToRelocation: true,
  openToRemote: true,
  locationRadiusMiles: null,
}

Deno.test('excludes unrelated consultant title for Mechanical Engineer profile (keyword / gate)', () => {
  const jobs: JobRecord[] = [
    baseJob({
      id: 'j-consultant',
      title: 'Senior Business Process Consultant',
      description: 'Transform processes across the enterprise.',
    }),
    baseJob({
      id: 'j-mech',
      title: 'Mechanical Engineer III',
      description: 'Design mechanical systems.',
    }),
  ]

  const { ranked, debug } = matchJobsWithDebug(prefs, jobs, null)
  assertEquals(ranked.some((j) => j.id === 'j-consultant'), false)
  assertEquals(ranked.some((j) => j.id === 'j-mech'), true)
  assertEquals(debug.filters.includedAfterFilters >= 1, true)
})

Deno.test('description-only engineer keyword does not satisfy Mechanical Engineer title gate', () => {
  const jobs: JobRecord[] = [
    baseJob({
      id: 'j-sales',
      title: 'Sales Account Executive',
      description:
        'We need someone comfortable discussing engineering topics with technical buyers.',
      aiBriefing: null,
    }),
  ]

  const { ranked, debug } = matchJobsWithDebug(prefs, jobs, null)
  assertEquals(ranked.some((j) => j.id === 'j-sales'), false)
  assertEquals(debug.filters.excludedByMultiTokenTitle >= 1, true)
})

Deno.test('profile excluded_keywords drops matching job titles only', () => {
  const jobs: JobRecord[] = [
    baseJob({ id: 'j-sales-title', title: 'Senior Sales Manager', description: null }),
    baseJob({ id: 'j-ok', title: 'Mechanical Engineer', description: null }),
  ]

  const withExcluded: SubscriberPreferences = {
    ...prefs,
    excludedKeywords: ['sales'],
  }

  const { ranked } = matchJobsWithDebug(withExcluded, jobs, null)
  assertEquals(ranked.some((j) => j.id === 'j-sales-title'), false)
  assertEquals(ranked.some((j) => j.id === 'j-ok'), true)
})
