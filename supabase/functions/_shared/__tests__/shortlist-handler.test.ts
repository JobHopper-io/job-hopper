import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createShortlistHandler, type PublicShortlist, type StoredShortlist } from '../shortlist-handler.ts'
import { newShortlistToken, SHORTLIST_TOKEN_RE, type ShortlistJobSnapshot } from '../prospect-shortlist.ts'

const NOW = new Date('2026-11-25T12:00:00Z')
const FN = 'https://ref.supabase.co/functions/v1/shortlist'

const snap = (id: string, link: string | null = `https://jobs.lever.co/acme/${id}`): ShortlistJobSnapshot => ({
  job_id: id,
  title: `Job ${id}`,
  company: 'Acme',
  location: 'Remote',
  apply_link: link,
  posted_date: '2026-11-20',
  bullets: ['Title matches your target role (Engineer)'],
  vacancy_status: 'open',
})

function setup(over: Partial<StoredShortlist> = {}, vacancy: Record<string, string> = {}) {
  const token = newShortlistToken()
  const stored: StoredShortlist = {
    id: 'sl-1',
    status: 'ready',
    jobs: [snap('j1'), snap('j2'), snap('j3')],
    expires_at: '2026-12-09T12:00:00Z',
    first_viewed_at: null,
    ...over,
  }
  const events: [string, string, string | null][] = []
  const firstViewed: string[] = []
  const lookups: string[] = []
  const handler = createShortlistHandler({
    functionUrl: FN,
    now: () => NOW,
    findByToken: (t) => {
      lookups.push(t)
      return Promise.resolve(t === token ? stored : null)
    },
    latestVacancy: (ids) => Promise.resolve(new Map(Object.entries(vacancy).filter(([k]) => ids.includes(k)))),
    logEvent: (id, ev, job) => (events.push([id, ev, job]), Promise.resolve()),
    markFirstViewed: (id) => (firstViewed.push(id), Promise.resolve()),
  })
  const get = (path: string) => handler(new Request(`${FN}${path}`))
  return { token, get, events, firstViewed, lookups }
}

Deno.test('newShortlistToken: 43-char base64url, unique', () => {
  const a = newShortlistToken()
  assert(SHORTLIST_TOKEN_RE.test(a))
  assert(a !== newShortlistToken())
})

Deno.test('view: returns the shortlist, logs a view and the first view', async () => {
  const { token, get, events, firstViewed } = setup()
  const res = await get(`?token=${token}`)
  assertEquals(res.status, 200)
  const body = (await res.json()) as PublicShortlist
  assertEquals(body.jobs.map((j) => j.job_id), ['j1', 'j2', 'j3'])
  assertEquals(body.jobs[0].click_url, `${FN}/click?token=${token}&job=j1`)
  assert(!('apply_link' in body.jobs[0]), 'apply links stay server-side')
  assertEquals(events, [['sl-1', 'view', null]])
  assertEquals(firstViewed, ['sl-1'])
})

Deno.test('view: first_viewed_at is not touched again', async () => {
  const { token, get, firstViewed } = setup({ first_viewed_at: '2026-11-24T00:00:00Z' })
  assertEquals((await get(`?token=${token}`)).status, 200)
  assertEquals(firstViewed, [])
})

Deno.test('view: jobs whose latest check is now closed are hidden', async () => {
  const { token, get } = setup({}, { j2: 'closed', j3: 'open', j1: 'unverified' })
  const body = (await (await get(`?token=${token}`)).json()) as PublicShortlist
  assertEquals(body.jobs.map((j) => j.job_id), ['j1', 'j3'])
})

Deno.test('unknown, malformed, expired and too_few tokens: bare 404, nothing logged', async () => {
  const cases = [
    setup(), // unknown token below
    setup({ expires_at: '2026-11-25T12:00:00Z' }), // expires exactly now
    setup({ expires_at: '2026-11-01T00:00:00Z' }),
    setup({ status: 'too_few' }),
  ]
  for (const [i, c] of cases.entries()) {
    const token = i === 0 ? newShortlistToken() : c.token
    const res = await c.get(`?token=${token}`)
    assertEquals(res.status, 404)
    assertEquals(await res.text(), 'Not found')
    assertEquals(c.events, [])
  }
  const bad = setup()
  for (const q of ['', '?token=', '?token=short', `?token=${'a'.repeat(42)}!`]) {
    assertEquals((await bad.get(q)).status, 404)
  }
  assertEquals(bad.lookups, [], 'malformed tokens never reach the database')
})

Deno.test('click: logs and redirects to the stored apply link', async () => {
  const { token, get, events } = setup()
  const res = await get(`/click?token=${token}&job=j2`)
  assertEquals(res.status, 302)
  assertEquals(res.headers.get('location'), 'https://jobs.lever.co/acme/j2')
  assertEquals(events, [['sl-1', 'click', 'j2']])
})

Deno.test('click: no open redirect -- only job ids in this shortlist', async () => {
  const { token, get, events } = setup()
  for (const q of [
    `/click?token=${token}&job=not-in-list`,
    `/click?token=${token}&job=https://evil.example`,
    `/click?token=${token}`,
    `/click?token=${token}&url=https://evil.example`,
    `/click?token=${newShortlistToken()}&job=j1`, // another token
  ]) {
    const res = await get(q)
    assertEquals(res.status, 404, q)
    assertEquals(res.headers.get('location'), null)
  }
  assertEquals(events, [])
})

Deno.test('click: a stored non-http link is never followed', async () => {
  const { token, get } = setup({ jobs: [snap('j1', 'javascript:alert(1)'), snap('j2'), snap('j3')] })
  assertEquals((await get(`/click?token=${token}&job=j1`)).status, 404)
})

Deno.test('click: expired shortlist does not redirect', async () => {
  const { token, get } = setup({ expires_at: '2026-11-20T00:00:00Z' })
  assertEquals((await get(`/click?token=${token}&job=j1`)).status, 404)
})

Deno.test('only GET (and CORS preflight) are accepted', async () => {
  const { token } = setup()
  const handler = createShortlistHandler({
    functionUrl: FN,
    findByToken: () => Promise.reject(new Error('not reached')),
    latestVacancy: () => Promise.resolve(new Map()),
    logEvent: () => Promise.resolve(),
    markFirstViewed: () => Promise.resolve(),
  })
  assertEquals((await handler(new Request(`${FN}?token=${token}`, { method: 'POST' }))).status, 405)
  assertEquals((await handler(new Request(FN, { method: 'OPTIONS' }))).status, 200)
})
