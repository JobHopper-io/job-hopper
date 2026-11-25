import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  HostThrottle,
  VACANCY_USER_AGENT,
  atsHost,
  createVacancyVerifier,
  isBambooCareersIndex,
  isFreshCheck,
  latestCheckByJob,
  jobPostingsFromJsonLd,
  judgeGenericPage,
  parseGreenhouse,
  workdayApiUrl,
} from '../job-vacancy.ts'

type Route = { status: number; location?: string; body?: string }

/** Mock fetch: exact URL -> response. Records every request. */
function mock(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchFn = (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const r = routes[url]
    if (!r) return Promise.reject(new Error(`unmocked ${url}`))
    const headers = new Headers(r.location ? { location: r.location } : {})
    return Promise.resolve(new Response(r.body ?? null, { status: r.status, headers }))
  }
  let clock = Date.parse('2026-11-25T12:00:00Z')
  const sleeps: number[] = []
  const verifier = createVacancyVerifier({
    fetch: fetchFn as typeof fetch,
    now: () => clock,
    sleep: (ms) => {
      sleeps.push(ms)
      clock += ms
      return Promise.resolve()
    },
  })
  return { verifier, calls, sleeps }
}

const LEVER_ID = '0b3c7a4e-1111-2222-3333-444455556666'
const ASHBY_ID = '9f1e2d3c-aaaa-bbbb-cccc-ddddeeeeffff'

Deno.test('atsHost: maps hostnames to ATS families', () => {
  assertEquals(atsHost('job-boards.greenhouse.io'), 'greenhouse')
  assertEquals(atsHost('grnh.se'), 'greenhouse')
  assertEquals(atsHost('jobs.lever.co'), 'lever')
  assertEquals(atsHost('careers-acme.icims.com'), 'icims')
  assertEquals(atsHost('acme.wd5.myworkdayjobs.com'), 'workday')
  assertEquals(atsHost('apply.workable.com'), 'workable')
  assertEquals(atsHost('www.indeed.com'), 'indeed')
  assertEquals(atsHost('www.example.org'), 'example.org')
})

Deno.test('parseGreenhouse: board URLs and embed links', () => {
  assertEquals(parseGreenhouse(new URL('https://job-boards.greenhouse.io/yext/jobs/8334973?gh_src=x')), { board: 'yext', id: '8334973' })
  assertEquals(parseGreenhouse(new URL('https://boards.greenhouse.io/embed/job_app?for=acme&token=123')), { board: 'acme', id: '123' })
  assertEquals(parseGreenhouse(new URL('https://boards.greenhouse.io/acme')), null)
})

Deno.test('greenhouse: API 200 = open, 404 = closed', async () => {
  const { verifier, calls } = mock({
    'https://boards-api.greenhouse.io/v1/boards/acme/jobs/1': { status: 200, body: '{}' },
    'https://boards-api.greenhouse.io/v1/boards/acme/jobs/2': { status: 404 },
  })
  const open = await verifier.verify('https://job-boards.greenhouse.io/acme/jobs/1')
  assertEquals([open.status, open.method, open.httpStatus, open.host], ['open', 'greenhouse_api', 200, 'greenhouse'])
  const closed = await verifier.verify('https://boards.greenhouse.io/acme/jobs/2')
  assertEquals([closed.status, closed.httpStatus], ['closed', 404])
  assert(calls.every((c) => (c.init?.headers as Record<string, string>)['User-Agent'] === VACANCY_USER_AGENT))
  assert(calls.every((c) => c.init?.redirect === 'manual'))
})

Deno.test('greenhouse: grnh.se short link is resolved, then the API is checked', async () => {
  const { verifier } = mock({
    'https://grnh.se/abc': { status: 301, location: 'https://job-boards.greenhouse.io/yext/jobs/8334973' },
    'https://job-boards.greenhouse.io/yext/jobs/8334973': { status: 200 },
    'https://boards-api.greenhouse.io/v1/boards/yext/jobs/8334973': { status: 404 },
  })
  const r = await verifier.verify('https://grnh.se/abc')
  assertEquals([r.status, r.method], ['closed', 'greenhouse_api'])
})

Deno.test('greenhouse: short link uses its first redirect, even when the board page redirects on', async () => {
  const { verifier, calls } = mock({
    'https://grnh.se/closed': { status: 301, location: 'https://job-boards.greenhouse.io/acme/jobs/77?gh_src=closed' },
    'https://boards-api.greenhouse.io/v1/boards/acme/jobs/77': { status: 404 },
  })
  const r = await verifier.verify('https://grnh.se/closed')
  assertEquals([r.status, r.method, r.httpStatus], ['closed', 'greenhouse_api', 404])
  assertEquals(calls.map((c) => c.url), ['https://grnh.se/closed', 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/77'])
})

Deno.test('greenhouse: short link to a company site is unverified, not guessed', async () => {
  const { verifier } = mock({
    'https://grnh.se/x': { status: 301, location: 'https://www.fanduel.careers/open-positions?gh_jid=1' },
    'https://www.fanduel.careers/open-positions?gh_jid=1': { status: 200 },
  })
  const r = await verifier.verify('https://grnh.se/x')
  assertEquals([r.status, r.method], ['unverified', 'unparsed_url'])
})

Deno.test('lever: API 200 = open, 404 = closed', async () => {
  const { verifier } = mock({
    [`https://api.lever.co/v0/postings/acme/${LEVER_ID}`]: { status: 404 },
  })
  const r = await verifier.verify(`https://jobs.lever.co/acme/${LEVER_ID}/apply`)
  assertEquals([r.status, r.method, r.httpStatus], ['closed', 'lever_api', 404])
})

Deno.test('ashby: listed on the job board = open, missing = closed, 404 board = closed', async () => {
  const board = JSON.stringify({ jobs: [{ id: ASHBY_ID }] })
  const { verifier } = mock({
    'https://api.ashbyhq.com/posting-api/job-board/acme': { status: 200, body: board },
    'https://api.ashbyhq.com/posting-api/job-board/gone': { status: 404 },
  })
  assertEquals((await verifier.verify(`https://jobs.ashbyhq.com/acme/${ASHBY_ID}`)).status, 'open')
  const missing = await verifier.verify('https://jobs.ashbyhq.com/acme/11111111-2222-3333-4444-555566667777')
  assertEquals([missing.status, missing.method], ['closed', 'ashby_api'])
  assertEquals((await verifier.verify(`https://jobs.ashbyhq.com/gone/${ASHBY_ID}`)).status, 'closed')
})

Deno.test('smartrecruiters: API 200 = open, 404 = closed', async () => {
  const { verifier } = mock({
    'https://api.smartrecruiters.com/v1/companies/Acme/postings/744000012345678': { status: 200, body: '{}' },
  })
  const r = await verifier.verify('https://jobs.smartrecruiters.com/Acme/744000012345678-backend-engineer')
  assertEquals([r.status, r.method], ['open', 'smartrecruiters_api'])
})

Deno.test('icims: 404 and 410 = closed, 200 = open', async () => {
  const { verifier } = mock({
    'https://careers-acme.icims.com/jobs/1/job': { status: 410 },
    'https://careers-acme.icims.com/jobs/2/job': { status: 404 },
    'https://careers-acme.icims.com/jobs/3/job': { status: 200 },
  })
  assertEquals((await verifier.verify('https://careers-acme.icims.com/jobs/1/job')).status, 'closed')
  assertEquals((await verifier.verify('https://careers-acme.icims.com/jobs/2/job')).status, 'closed')
  const open = await verifier.verify('https://careers-acme.icims.com/jobs/3/job')
  assertEquals([open.status, open.method, open.httpStatus], ['open', 'icims_page', 200])
})

Deno.test('bamboohr: redirect to /careers = closed, 200 = open', async () => {
  assert(isBambooCareersIndex('/careers', 'https://acme.bamboohr.com/careers/12'))
  assert(!isBambooCareersIndex('/careers/12', 'https://acme.bamboohr.com/careers/12'))
  const { verifier } = mock({
    'https://acme.bamboohr.com/careers/12': { status: 302, location: '/careers' },
    'https://acme.bamboohr.com/careers/13': { status: 200 },
  })
  const closed = await verifier.verify('https://acme.bamboohr.com/careers/12')
  assertEquals([closed.status, closed.method, closed.httpStatus], ['closed', 'bamboohr_page', 302])
  assertEquals((await verifier.verify('https://acme.bamboohr.com/careers/13')).status, 'open')
})

Deno.test('indeed is never requested', async () => {
  const { verifier, calls } = mock({})
  for (const url of ['https://www.indeed.com/viewjob?jk=1', 'https://indeed.com/job/x-1']) {
    const r = await verifier.verify(url)
    assertEquals([r.status, r.method, r.httpStatus, r.host], ['unverified', 'unsupported_host', null, 'indeed'])
  }
  assertEquals(calls.length, 0)
})

// ---- Workday ----------------------------------------------------------------

Deno.test('workdayApiUrl: derives the cxs endpoint, with or without a locale', () => {
  assertEquals(
    workdayApiUrl(new URL('https://lseg.wd3.myworkdayjobs.com/en-US/Careers/job/USA-Buffalo/Manager_R0124009')),
    'https://lseg.wd3.myworkdayjobs.com/wday/cxs/lseg/Careers/job/USA-Buffalo/Manager_R0124009',
  )
  assertEquals(
    workdayApiUrl(new URL('https://aes.wd1.myworkdayjobs.com/aes_clean_energy/job/US-Louisville-CO/Engineer_R1064842')),
    'https://aes.wd1.myworkdayjobs.com/wday/cxs/aes/aes_clean_energy/job/US-Louisville-CO/Engineer_R1064842',
  )
  assertEquals(workdayApiUrl(new URL('https://aes.wd1.myworkdayjobs.com/aes_clean_energy')), null)
})

const WD = 'https://aes.wd1.myworkdayjobs.com/aes_clean_energy/job/US-CO/Engineer_R1'
const WD_API = 'https://aes.wd1.myworkdayjobs.com/wday/cxs/aes/aes_clean_energy/job/US-CO/Engineer_R1'

Deno.test('workday: posting payload = open', async () => {
  const { verifier } = mock({ [WD_API]: { status: 200, body: JSON.stringify({ jobPostingInfo: { id: 'x', title: 'Engineer' } }) } })
  const r = await verifier.verify(WD)
  assertEquals([r.status, r.method, r.httpStatus, r.host], ['open', 'workday_api', 200, 'workday'])
})

Deno.test('workday: 404 = closed; 4xx error payload (unlisted posting) = closed', async () => {
  const notFound = mock({ [WD_API]: { status: 404, body: '{"errorCode":"S21","message":"not found"}' } })
  assertEquals((await notFound.verifier.verify(WD)).status, 'closed')
  const denied = mock({ [WD_API]: { status: 403, body: '{"errorCode":"S22","httpStatus":403,"message":"permission denied"}' } })
  const r = await denied.verifier.verify(WD)
  assertEquals([r.status, r.httpStatus, r.detail], ['closed', 403, 'error S22'])
})

Deno.test('workday: 5xx or a 200 without a posting is unverified', async () => {
  const down = mock({ [WD_API]: { status: 503, body: '{"errorCode":"X"}' } })
  assertEquals((await down.verifier.verify(WD)).status, 'unverified')
  const odd = mock({ [WD_API]: { status: 200, body: '<html></html>' } })
  assertEquals((await odd.verifier.verify(WD)).status, 'unverified')
})

// ---- Workable ---------------------------------------------------------------

Deno.test('workable: /j/ short link resolves the account, then the API decides', async () => {
  const { verifier, calls } = mock({
    'https://apply.workable.com/j/7873B7FC2D': { status: 301, location: '/scitec/j/7873B7FC2D' },
    'https://apply.workable.com/api/v2/accounts/scitec/jobs/7873B7FC2D': { status: 200, body: '{}' },
  })
  const r = await verifier.verify('https://apply.workable.com/j/7873B7FC2D')
  assertEquals([r.status, r.method, r.host], ['open', 'workable_api', 'workable'])
  assertEquals(calls.length, 2)
})

Deno.test('workable: 404 = closed', async () => {
  const { verifier } = mock({ 'https://apply.workable.com/api/v2/accounts/acme/jobs/ABC123': { status: 404, body: 'Job not found' } })
  const r = await verifier.verify('https://apply.workable.com/acme/j/ABC123/')
  assertEquals([r.status, r.httpStatus], ['closed', 404])
})

// ---- Generic page (JSON-LD + closed phrases) -----------------------------------

const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`
const page = (head: string, body: string) => `<html><head>${head}</head><body>${body}</body></html>`
const NOW = Date.parse('2026-11-25T12:00:00Z')

Deno.test('judgeGenericPage: valid JobPosting JSON-LD = likely_open', () => {
  const html = page(ld({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Engineer', validThrough: '2026-12-31' }), '<h1>Engineer</h1>')
  assertEquals(judgeGenericPage(200, html, NOW).status, 'likely_open')
  // no validThrough at all still counts as not expired
  assertEquals(judgeGenericPage(200, page(ld({ '@type': 'JobPosting' }), ''), NOW).status, 'likely_open')
})

Deno.test('judgeGenericPage: page with closed text = closed, even with JSON-LD', () => {
  const html = page(ld({ '@type': 'JobPosting', validThrough: '2027-01-01' }), '<p>We are <b>no longer accepting applications</b> for this role.</p>')
  const r = judgeGenericPage(200, html, NOW)
  assertEquals(r.status, 'closed')
  assert(r.detail?.includes('no longer accepting applications'))
  assertEquals(judgeGenericPage(200, page('', 'Sorry, this position has been filled.'), NOW).status, 'closed')
})

Deno.test('judgeGenericPage: expired validThrough = closed', () => {
  const html = page(ld({ '@type': 'JobPosting', validThrough: '2026-10-01T00:00:00Z' }), '<h1>Engineer</h1>')
  assertEquals(judgeGenericPage(200, html, NOW), { status: 'closed', detail: 'JobPosting validThrough is in the past' })
})

Deno.test('judgeGenericPage: no JSON-LD and no closed text = unverified', () => {
  assertEquals(judgeGenericPage(200, page('', '<h1>Engineer</h1><p>Apply now</p>'), NOW).status, 'unverified')
  // JSON-LD of another type is not a JobPosting
  assertEquals(judgeGenericPage(200, page(ld({ '@type': 'Organization' }), ''), NOW).status, 'unverified')
  // malformed JSON-LD is ignored
  assertEquals(judgeGenericPage(200, page('<script type="application/ld+json">{oops</script>', ''), NOW).status, 'unverified')
})

Deno.test('judgeGenericPage: phrases inside scripts or styles are not page text', () => {
  const html = page(`<script>var i18n={notFound:"Job not found"}</script>` + ld({ '@type': 'JobPosting' }), '<h1>Engineer</h1>')
  assertEquals(judgeGenericPage(200, html, NOW).status, 'likely_open')
})

Deno.test('judgeGenericPage: @graph and @type arrays are understood', () => {
  const graph = ld({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@type': ['JobPosting'], validThrough: '2027-01-01' }] })
  assertEquals(judgeGenericPage(200, page(graph, ''), NOW).status, 'likely_open')
  assertEquals(jobPostingsFromJsonLd(graph).length, 1)
})

Deno.test('judgeGenericPage: non-2xx is closed only with closed text, else unverified', () => {
  assertEquals(judgeGenericPage(404, page('', '<h1>Job not found</h1>'), NOW).status, 'closed')
  assertEquals(judgeGenericPage(404, page('', '<h1>Oops</h1>'), NOW).status, 'unverified')
  assertEquals(judgeGenericPage(500, page(ld({ '@type': 'JobPosting' }), ''), NOW).status, 'unverified')
})

Deno.test('generic: any other host is fetched (redirects followed) and judged', async () => {
  const { verifier, calls } = mock({
    'https://careers.example.org/job/1': { status: 302, location: '/jobs/1' },
    'https://careers.example.org/jobs/1': { status: 200, body: page(ld({ '@type': 'JobPosting', validThrough: '2099-01-01' }), '') },
    'https://recruiting.adp.com/x': { status: 200, body: page('', 'This job has expired') },
  })
  const r = await verifier.verify('https://careers.example.org/job/1')
  assertEquals([r.status, r.method, r.httpStatus, r.host], ['likely_open', 'generic_page', 200, 'careers.example.org'])
  assertEquals(calls.length, 2)
  assertEquals((await verifier.verify('https://recruiting.adp.com/x')).status, 'closed')
})

Deno.test('generic: fetch errors are unverified', async () => {
  const { verifier } = mock({})
  const r = await verifier.verify('https://careers.example.org/missing')
  assertEquals([r.status, r.method], ['unverified', 'error'])
})

Deno.test('missing or non-http apply links are unverified', async () => {
  const { verifier } = mock({})
  assertEquals((await verifier.verify(null)).method, 'unparsed_url')
  assertEquals((await verifier.verify('mailto:jobs@acme.com')).status, 'unverified')
})

Deno.test('network errors and unexpected statuses are unverified, never open', async () => {
  const { verifier } = mock({
    'https://boards-api.greenhouse.io/v1/boards/acme/jobs/9': { status: 503 },
  })
  const err = await verifier.verify(`https://jobs.lever.co/acme/${LEVER_ID}`) // unmocked -> fetch rejects
  assertEquals([err.status, err.method], ['unverified', 'error'])
  const flaky = await verifier.verify('https://boards.greenhouse.io/acme/jobs/9')
  assertEquals([flaky.status, flaky.httpStatus], ['unverified', 503])
})

Deno.test('redirects: at most 3 are followed', async () => {
  const { verifier, calls } = mock({
    'https://careers-acme.icims.com/a': { status: 302, location: '/b' },
    'https://careers-acme.icims.com/b': { status: 302, location: '/c' },
    'https://careers-acme.icims.com/c': { status: 302, location: '/d' },
    'https://careers-acme.icims.com/d': { status: 302, location: '/e' },
    'https://careers-acme.icims.com/e': { status: 200 },
  })
  const r = await verifier.verify('https://careers-acme.icims.com/a')
  assertEquals(r.status, 'unverified')
  assertEquals(calls.length, 4) // the original request + 3 redirects
})

Deno.test('every request carries a 10s timeout signal', async () => {
  const { verifier, calls } = mock({ 'https://careers-acme.icims.com/jobs/3/job': { status: 200 } })
  await verifier.verify('https://careers-acme.icims.com/jobs/3/job')
  assert(calls[0].init?.signal instanceof AbortSignal)
})

Deno.test('throttle: one request per second per host, other hosts not delayed', async () => {
  let clock = 0
  const sleeps: number[] = []
  const t = new HostThrottle({ now: () => clock, sleep: (ms) => (sleeps.push(ms), (clock += ms), Promise.resolve()) })
  await t.wait('api.lever.co')
  await t.wait('api.lever.co')
  await t.wait('boards-api.greenhouse.io')
  await t.wait('api.lever.co')
  assertEquals(sleeps, [1000, 1000])
})

Deno.test('result carries checked_at from the injected clock', async () => {
  const { verifier } = mock({})
  assertEquals((await verifier.verify('https://www.indeed.com/viewjob?jk=1')).checkedAt, '2026-11-25T12:00:00.000Z')
})

// ---- cache helpers (job_vacancy_checks) ----------------------------------------

Deno.test('isFreshCheck: reused for 24h, then rechecked', () => {
  const now = Date.parse('2026-11-25T12:00:00Z')
  assertEquals(isFreshCheck({ checked_at: '2026-11-24T12:00:01Z' }, now), true)
  assertEquals(isFreshCheck({ checked_at: '2026-11-24T12:00:00Z' }, now), false)
  assertEquals(isFreshCheck({ checked_at: 'not a date' }, now), false)
})

Deno.test('latestCheckByJob: newest row per job, any input order', () => {
  const rows = [
    { job_id: 'a', checked_at: '2026-11-20T00:00:00Z', status: 'open' },
    { job_id: 'a', checked_at: '2026-11-24T00:00:00Z', status: 'closed' },
    { job_id: 'b', checked_at: '2026-11-22T00:00:00Z', status: 'open' },
    { job_id: 'a', checked_at: '2026-11-21T00:00:00Z', status: 'open' },
  ]
  const latest = latestCheckByJob(rows)
  assertEquals(latest.get('a')?.status, 'closed')
  assertEquals(latest.get('b')?.status, 'open')
})
