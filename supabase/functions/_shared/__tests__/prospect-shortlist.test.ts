import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { RankedJob } from '../job-matching-algorithm.ts'
import type { ProspectMatchingFields } from '../prospect-matching.ts'
import type { VacancyResult, VacancyStatus } from '../job-vacancy.ts'
import {
  SHORTLIST_MAX,
  assembleShortlist,
  fallbackWhyFit,
  sharedTitleWords,
  verifyUntilEnough,
} from '../prospect-shortlist.ts'

const prospect = (over: Partial<ProspectMatchingFields> = {}): ProspectMatchingFields => ({
  id: 'p1',
  target_job_title: 'Backend Engineer',
  target_role_categories: ['engineering'],
  preferred_locations: ['Austin, TX', 'Remote'],
  open_to_remote: true,
  career_level: 'entry_mid',
  ...over,
})

let n = 0
const job = (over: Partial<RankedJob> = {}): RankedJob => ({
  id: `job-${++n}`,
  title: 'Senior Backend Engineer',
  companyName: 'Acme',
  roleCategory: 'engineering',
  location: 'Austin, TX',
  isRemote: false,
  description: 'Visa sponsorship available. Python, Go.',
  aiBriefing: 'Great company with sponsorship.',
  applyLink: 'https://jobs.lever.co/acme/x',
  payMin: 100000,
  payMax: 150000,
  payType: 'yearly',
  createdAt: '2026-11-01T00:00:00Z',
  postedDate: '2026-11-01T00:00:00Z',
  subscriptionTier: 'entry_mid',
  score: 80,
  effectiveSponsorshipLikelihood: 'High',
  ...over,
})

const v = (status: VacancyStatus): VacancyResult => ({
  status,
  method: 'lever_api',
  httpStatus: status === 'open' ? 200 : status === 'closed' ? 404 : null,
  checkedAt: '2026-11-25T00:00:00.000Z',
  host: 'lever',
})

Deno.test('sharedTitleWords: ignores generic words', () => {
  assertEquals(sharedTitleWords('Senior Software Engineer', 'Staff Software Engineer, Payments'), ['software'])
  assertEquals(sharedTitleWords('Senior Engineer', 'Engineer II'), [])
})

Deno.test('fallbackWhyFit: title, location and level facts for an on-site job', () => {
  assertEquals(fallbackWhyFit(prospect(), job()), [
    'Title matches your target role (Backend Engineer)',
    'Based in Austin, TX, which is in your preferred locations (Austin, TX)',
    'Entry & Mid Level role, matching your experience level',
  ])
})

Deno.test('fallbackWhyFit: remote job for a remote-open prospect', () => {
  const b = fallbackWhyFit(prospect({ target_job_title: 'Data Engineer' }), job({ title: 'Data Platform Engineer', isRemote: true, location: 'United States' }))
  assertEquals(b, [
    'Title shares "data" with your target role (Data Engineer)',
    "Remote role, and you're open to remote work",
    'Entry & Mid Level role, matching your experience level',
  ])
})

Deno.test('fallbackWhyFit: no sponsorship, pay or description claims, ever', () => {
  const bullets = fallbackWhyFit(prospect(), job()).join(' ').toLowerCase()
  for (const banned of ['sponsor', 'visa', '$', 'salary', 'python', 'great company']) assert(!bullets.includes(banned), banned)
})

Deno.test('fallbackWhyFit: drops facts it cannot back up', () => {
  // No title overlap, location not preferred, not remote, level differs -> nothing to say.
  const b = fallbackWhyFit(
    prospect({ target_job_title: 'Nurse', career_level: 'senior_management', preferred_locations: ['Ohio'] }),
    job({ title: 'Backend Engineer', location: 'Austin, TX' }),
  )
  assertEquals(b, [])
  // "Remote" in preferred locations never matches an on-site job.
  assertEquals(fallbackWhyFit(prospect({ preferred_locations: ['Remote'] }), job()).some((x) => x.startsWith('Based in')), false)
  // Remote job, prospect not open to remote: no remote bullet.
  assertEquals(fallbackWhyFit(prospect({ open_to_remote: false }), job({ isRemote: true })).some((x) => x.startsWith('Remote')), false)
})

Deno.test('fallbackWhyFit: at most 3 bullets', () => {
  assert(fallbackWhyFit(prospect(), job()).length <= 3)
})

Deno.test('assembleShortlist: only open jobs, in order, never more than 5', () => {
  const statuses: VacancyStatus[] = ['closed', 'open', 'unverified', 'open', 'open', 'open', 'closed', 'open', 'open', 'open']
  const checked = statuses.map((s, i) => ({ job: job({ score: 100 - i }), vacancy: v(s) }))
  const s = assembleShortlist(prospect(), checked)
  assertEquals(s.items.length, SHORTLIST_MAX)
  assertEquals(s.status, 'ready')
  assert(s.items.every((i) => i.vacancy.status === 'open'))
  assertEquals(s.items.map((i) => i.score), [99, 97, 96, 95, 93])
  assert(s.items.every((i) => i.bullets.length > 0 && i.applyLink && i.title))
})

Deno.test('assembleShortlist: fewer than 3 open -> too_few, still no closed/unverified', () => {
  const checked = [v('open'), v('unverified'), v('closed'), v('open')].map((vac) => ({ job: job(), vacancy: vac }))
  const s = assembleShortlist(prospect(), checked)
  assertEquals(s.status, 'too_few')
  assertEquals(s.items.length, 2)
  assert(s.items.every((i) => i.vacancy.status === 'open'))
  assertEquals(assembleShortlist(prospect(), []).items, [])
})

Deno.test('assembleShortlist: remote jobs are labelled remote', () => {
  const s = assembleShortlist(prospect(), [{ job: job({ isRemote: true, location: null }), vacancy: v('open') }])
  assertEquals(s.items[0].location, 'Remote')
})

Deno.test('verifyUntilEnough: stops at 5 open, verifies in order', async () => {
  const jobs = Array.from({ length: 10 }, (_, i) => job({ score: 100 - i }))
  const pattern: VacancyStatus[] = ['open', 'closed', 'open', 'open', 'unverified', 'open', 'open', 'open', 'open', 'open']
  const seen: number[] = []
  const checked = await verifyUntilEnough(jobs, (j) => {
    seen.push(j.score)
    return Promise.resolve(v(pattern[100 - j.score]))
  })
  assertEquals(seen, [100, 99, 98, 97, 96, 95, 94]) // 5th open found at index 6, then stop
  assertEquals(checked.filter((c) => c.vacancy.status === 'open').length, 5)
})

Deno.test('verifyUntilEnough: runs out of candidates gracefully', async () => {
  const checked = await verifyUntilEnough([job(), job()], () => Promise.resolve(v('closed')))
  assertEquals(checked.length, 2)
  assertEquals(assembleShortlist(prospect(), checked).items.length, 0)
})

// ---- likely_open policy ------------------------------------------------------

const NOW = Date.parse('2026-11-25T00:00:00Z')
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

Deno.test('assembleShortlist: open first, then likely_open posted within 21 days', () => {
  const checked = [
    { job: job({ score: 95, postedDate: ago(5) }), vacancy: v('likely_open') },
    { job: job({ score: 90, postedDate: ago(40) }), vacancy: v('open') },
    { job: job({ score: 85, postedDate: ago(25) }), vacancy: v('likely_open') }, // too old for likely_open
    { job: job({ score: 80, postedDate: ago(10) }), vacancy: v('open') },
    { job: job({ score: 75, postedDate: ago(21) }), vacancy: v('likely_open') }, // exactly 21 days: in
  ]
  const s = assembleShortlist(prospect(), checked, NOW)
  assertEquals(s.items.map((i) => [i.score, i.vacancy.status]), [[90, 'open'], [80, 'open'], [95, 'likely_open'], [75, 'likely_open']])
  assertEquals(s.status, 'ready')
})

Deno.test('assembleShortlist: likely_open without a posted date is excluded', () => {
  const s = assembleShortlist(prospect(), [{ job: job({ postedDate: null }), vacancy: v('likely_open') }], NOW)
  assertEquals(s.items.length, 0)
})

Deno.test('assembleShortlist: Indeed is always excluded, whatever the status says', () => {
  const indeed = job({ applyLink: 'https://www.indeed.com/viewjob?jk=1', postedDate: ago(1) })
  const s = assembleShortlist(prospect(), [
    { job: indeed, vacancy: v('open') },
    { job: indeed, vacancy: { ...v('likely_open'), host: 'indeed' } },
  ], NOW)
  assertEquals(s.items.length, 0)
})

Deno.test('assembleShortlist: never more than 5, never closed or unverified (mixed statuses)', () => {
  const statuses: VacancyStatus[] = ['likely_open', 'closed', 'open', 'unverified', 'likely_open', 'open', 'likely_open', 'open', 'likely_open', 'closed']
  const s = assembleShortlist(prospect(), statuses.map((st, i) => ({ job: job({ score: 100 - i, postedDate: ago(3) }), vacancy: v(st) })), NOW)
  assertEquals(s.items.length, 5)
  assert(s.items.every((i) => i.vacancy.status === 'open' || i.vacancy.status === 'likely_open'))
  assertEquals(s.items.slice(0, 3).map((i) => i.vacancy.status), ['open', 'open', 'open'])
})
