import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { JobRecord } from '../job-matching-algorithm.ts'
import {
  type MatchingContext,
  type ProspectMatchingFields,
  configForWindow,
  matchJobsForProspect,
  prospectToPreferences,
} from '../prospect-matching.ts'

const prospect = (over: Partial<ProspectMatchingFields> = {}): ProspectMatchingFields => ({
  id: 'p1',
  target_job_title: 'Backend Engineer',
  target_role_categories: ['engineering'],
  preferred_locations: ['Austin, TX'],
  open_to_remote: true,
  career_level: 'entry_mid',
  ...over,
})

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()

const job = (over: Partial<JobRecord> = {}): JobRecord => ({
  id: crypto.randomUUID(),
  title: 'Backend Engineer',
  companyName: 'Acme',
  roleCategory: 'engineering',
  location: 'Austin, TX',
  isRemote: true,
  description: 'Build backend services.',
  aiBriefing: null,
  applyLink: 'https://jobs.lever.co/acme/00000000-0000-0000-0000-000000000000',
  payMin: null,
  payMax: null,
  payType: null,
  createdAt: daysAgo(5),
  postedDate: daysAgo(5),
  subscriptionTier: 'entry_mid',
  ...over,
})

const ctx: MatchingContext = { config: { recency: { maxAgeDays: 40 } }, synonyms: [], liveMaxAgeDays: 40 }

Deno.test('prospectToPreferences: maps prospect fields and leaves profile-only fields null', () => {
  const r = prospectToPreferences(prospect())
  assert(r.ok)
  assertEquals(r.careerLevel, 'entry_mid')
  assertEquals(r.prefs, {
    subscriptionTierProductKeys: ['entry_mid'],
    roles: ['engineering'],
    targetJobTitle: 'Backend Engineer',
    currentJobTitle: null,
    currentIndustry: null,
    payRangeMin: null,
    payRangeMax: null,
    preferredLocations: ['Austin, TX'],
    openToRelocation: null,
    openToRemote: true,
    locationRadiusMiles: null,
  })
})

Deno.test('prospectToPreferences: null arrays become empty arrays', () => {
  const r = prospectToPreferences(prospect({ target_role_categories: null, preferred_locations: null }))
  assert(r.ok)
  assertEquals(r.prefs.roles, [])
  assertEquals(r.prefs.preferredLocations, [])
})

Deno.test('prospectToPreferences: no career_level -> no_level', () => {
  assertEquals(prospectToPreferences(prospect({ career_level: null })), { ok: false, reason: 'no_level' })
  assertEquals(prospectToPreferences(prospect({ career_level: '  ' })), { ok: false, reason: 'no_level' })
})

Deno.test('configForWindow: defaults to the live max age, keeps the rest of the config', () => {
  const c = { ...ctx, config: { recency: { maxAgeDays: 40 }, thresholds: { minTotalScore: 45 } } }
  assertEquals(configForWindow(c).recency?.maxAgeDays, 40)
  assertEquals(configForWindow(c, 60).recency?.maxAgeDays, 60)
  assertEquals(configForWindow(c, 60).thresholds?.minTotalScore, 45)
})

Deno.test('matchJobsForProspect: skips a prospect with no level', () => {
  assertEquals(matchJobsForProspect(prospect({ career_level: null }), [job()], ctx), {
    status: 'skipped',
    prospectId: 'p1',
    reason: 'no_level',
  })
})

Deno.test('matchJobsForProspect: applies level, window and limit', () => {
  const jobs = [
    ...Array.from({ length: 12 }, () => job()),
    job({ subscriptionTier: 'senior_management' }), // wrong level
    job({ postedDate: daysAgo(50), createdAt: daysAgo(50) }), // outside the default 40-day window
  ]
  const r = matchJobsForProspect(prospect(), jobs, ctx)
  assert(r.status === 'matched')
  assertEquals(r.totalMatched, 12)
  assertEquals(r.candidates.length, 10) // default limit
  assert(r.candidates.every((c) => c.subscriptionTier === 'entry_mid'))

  const wide = matchJobsForProspect(prospect(), jobs, ctx, { windowDays: 60, limit: 20 })
  assert(wide.status === 'matched')
  assertEquals(wide.totalMatched, 13) // the 50-day-old job is back in
})

Deno.test('matchJobsForProspect: respects a prospect who is not open to remote', () => {
  const r = matchJobsForProspect(prospect({ open_to_remote: false }), [job({ isRemote: true })], ctx)
  assert(r.status === 'matched')
  assertEquals(r.totalMatched, 0)
})
