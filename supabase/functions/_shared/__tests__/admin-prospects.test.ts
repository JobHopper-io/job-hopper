import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  type AdminProspectsDeps,
  buildReviewPatch,
  createAdminProspectsHandler,
  type ListFilters,
  maskEmail,
  parseListFilters,
  parseReviewBody,
  type ReviewPatch,
} from '../admin-prospects.ts'

const PROSPECT = '11111111-2222-4333-8444-555555555555'
const NOW = new Date('2026-11-22T10:00:00.000Z')

function harness(overrides: Partial<AdminProspectsDeps> = {}) {
  const reviews: { id: string; patch: ReviewPatch }[] = []
  const lists: ListFilters[] = []
  const handler = createAdminProspectsHandler({
    getCallerUserId: (auth) => Promise.resolve(auth === 'Bearer admin' || auth === 'Bearer user' ? `uid-${auth.slice(7)}` : null),
    isAdmin: (auth) => Promise.resolve(auth === 'Bearer admin'),
    getProfileId: (uid) => Promise.resolve(uid === 'uid-admin' ? 'profile-admin' : null),
    listProspects: (f) => (lists.push(f), Promise.resolve({ prospects: [{ id: PROSPECT }], total: 1 })),
    getStats: () => Promise.resolve({ pending: 3, approved: 1, rejected: 0, reviewed_today: 1 }),
    reviewProspect: (id, patch) => (reviews.push({ id, patch }), Promise.resolve(id === PROSPECT ? { id, ...patch } : null)),
    now: () => NOW,
    ...overrides,
  })
  return { handler, reviews, lists }
}

const get = (h: (r: Request) => Promise<Response>, qs = '', auth: string | null = 'Bearer admin') =>
  h(new Request(`https://x/admin-prospects${qs}`, { headers: auth ? { Authorization: auth } : {} }))
const post = (h: (r: Request) => Promise<Response>, body: unknown, auth: string | null = 'Bearer admin') =>
  h(new Request('https://x/admin-prospects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))

// --- admin gate ---

Deno.test('admin gate: no auth 401, unknown user 401, non-admin 403, for GET and POST; nothing runs', async () => {
  const { handler, reviews, lists } = harness()
  for (const auth of [null, 'Bearer stranger']) {
    assertEquals((await get(handler, '', auth)).status, 401)
    assertEquals((await post(handler, { prospectId: PROSPECT, action: 'approve' }, auth)).status, 401)
  }
  assertEquals((await get(handler, '', 'Bearer user')).status, 403)
  assertEquals((await post(handler, { prospectId: PROSPECT, action: 'approve' }, 'Bearer user')).status, 403)
  assertEquals(reviews.length + lists.length, 0)
})

Deno.test('admin gate: a failing role check is a 500, not a pass', async () => {
  const { handler, reviews } = harness({ isAdmin: () => Promise.reject(new Error('rpc down')) })
  assertEquals((await post(handler, { prospectId: PROSPECT, action: 'approve' })).status, 500)
  assertEquals(reviews.length, 0)
})

Deno.test('admin GET lists with parsed filters and stats', async () => {
  const { handler, lists } = harness()
  const res = await get(handler, '?review_status=pending&segment=laid_off&min_score=60&has_email=true&limit=25&offset=50')
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.total, 1)
  assertEquals(body.stats.pending, 3)
  assertEquals(lists[0], { reviewStatus: 'pending', segment: 'laid_off', minScore: 60, hasEmail: true, limit: 25, offset: 50 })
})

Deno.test('list filter validation', () => {
  const bad = ['?review_status=maybe', '?segment=unicorn', '?min_score=101', '?min_score=abc', '?has_email=yes', '?limit=0', '?limit=500', '?offset=-1']
  for (const qs of bad) assertEquals(parseListFilters(new URL(`https://x/${qs}`).searchParams).ok, false, qs)
  const ok = parseListFilters(new URL('https://x/').searchParams)
  assert(ok.ok)
  assertEquals(ok.filters, { reviewStatus: null, segment: null, minScore: null, hasEmail: null, limit: 50, offset: 0 })
})

// --- action validation ---

Deno.test('review validation rejects bad ids, actions, titles and levels', async () => {
  const { handler, reviews } = harness()
  const bad = [
    { prospectId: 'not-a-uuid', action: 'approve' },
    { prospectId: PROSPECT, action: 'delete' },
    { prospectId: PROSPECT },
    { prospectId: PROSPECT, action: 'approve', careerLevel: 'senior' },
    { prospectId: PROSPECT, action: 'approve', targetJobTitle: 'x' },
    { prospectId: PROSPECT, action: 'approve', targetJobTitle: 42 },
  ]
  for (const body of bad) assertEquals((await post(handler, body)).status, 400, JSON.stringify(body))
  assertEquals((await post(handler, 'not json')).status, 400)
  assertEquals(reviews.length, 0)
})

Deno.test('extra fields such as email or consent_status are never written', () => {
  const parsed = parseReviewBody({ prospectId: PROSPECT, action: 'approve', email: 'x@y.com', consent_status: 'opted_in', review_status: 'approved' })
  assert(parsed.ok)
  const patch = buildReviewPatch(parsed, 'profile-admin', NOW) as unknown as Record<string, unknown>
  for (const k of ['email', 'consent_status', 'email_normalized']) assertEquals(k in patch, false, k)
})

// --- reviewer fields + do_not_contact ---

Deno.test('approve sets review_status, reviewed_at and reviewed_by = caller profile', async () => {
  const { handler, reviews } = harness()
  const res = await post(handler, { prospectId: PROSPECT, action: 'approve' })
  assertEquals(res.status, 200)
  assertEquals(reviews, [{ id: PROSPECT, patch: { review_status: 'approved', reviewed_at: '2026-11-22T10:00:00.000Z', reviewed_by: 'profile-admin' } }])
})

Deno.test('reject records rejected without do_not_contact', async () => {
  const { handler, reviews } = harness()
  await post(handler, { prospectId: PROSPECT, action: 'reject' })
  assertEquals(reviews[0].patch.review_status, 'rejected')
  assertEquals('do_not_contact' in reviews[0].patch, false)
})

Deno.test('do_not_contact rejects AND sets do_not_contact = true', async () => {
  const { handler, reviews } = harness()
  await post(handler, { prospectId: PROSPECT, action: 'do_not_contact' })
  assertEquals(reviews[0].patch, { review_status: 'rejected', reviewed_at: '2026-11-22T10:00:00.000Z', reviewed_by: 'profile-admin', do_not_contact: true })
})

Deno.test('optional corrections are applied, trimmed', async () => {
  const { handler, reviews } = harness()
  await post(handler, { prospectId: PROSPECT, action: 'approve', targetJobTitle: '  Staff   Engineer ', careerLevel: 'senior_management' })
  assertEquals(reviews[0].patch.target_job_title, 'Staff Engineer')
  assertEquals(reviews[0].patch.career_level, 'senior_management')
})

Deno.test('unknown prospect is a 404; admin without a profile is refused', async () => {
  const { handler } = harness()
  assertEquals((await post(handler, { prospectId: '99999999-2222-4333-8444-555555555555', action: 'approve' })).status, 404)
  const noProfile = harness({ getProfileId: () => Promise.resolve(null) })
  assertEquals((await post(noProfile.handler, { prospectId: PROSPECT, action: 'approve' })).status, 403)
  assertEquals(noProfile.reviews.length, 0)
})

Deno.test('maskEmail', () => {
  assertEquals(maskEmail('kara@kara.dev'), 'k***@kara.dev')
  assertEquals(maskEmail(null), null)
})
