import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { type ApplyUnsubscribeInput, createUnsubscribeHandler } from '../unsubscribe-handler.ts'
import {
  createUnsubscribeToken,
  getFooterLinksForProfile,
  getTransactionalFooterLinks,
  isValidUnsubscribeUrl,
  normalizeEmail,
  verifyUnsubscribeToken,
} from '../unsubscribe-token.ts'

const SECRET = 'test-secret'
const FN_URL = 'https://proj.supabase.co/functions/v1/unsubscribe-email'

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** A token in the pre-v2 format, signed exactly like the old createUnsubscribeToken. */
async function legacyV1Token(profileId: string, exp: number, secret = SECRET): Promise<string> {
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify({ profile_id: profileId, scope: 'all', exp })))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${b64url(new Uint8Array(sig))}`
}

/** Handler wired to an in-memory store with apply_unsubscribe's idempotency (one row per email). */
function harness({ secret }: { secret: string | undefined } = { secret: SECRET }) {
  const applied: ApplyUnsubscribeInput[] = []
  const rows = new Map<string, string>()
  const handler = createUnsubscribeHandler({
    secret,
    siteUrl: 'https://job-hopper.io',
    applyUnsubscribe: (input) => {
      applied.push(input)
      const email = input.email ?? `profile:${input.profileId}`
      if (!rows.has(email) || input.scope === 'all') rows.set(email, input.scope)
      return Promise.resolve(email)
    },
  })
  return { handler, applied, rows }
}

const oneClick = (token: string) =>
  new Request(`${FN_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  })

const jsonPost = (token: string) =>
  new Request(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })

const marketingToken = () => createUnsubscribeToken({ email: '  Reader@Example.COM ', profileId: 'p-1', scope: 'marketing' }, SECRET)

Deno.test('GET redirects to the confirm page and never writes', async () => {
  const { handler, applied } = harness()
  const token = await marketingToken()
  const res = await handler(new Request(`${FN_URL}?token=${encodeURIComponent(token)}`))
  assertEquals(res.status, 302)
  assertEquals(res.headers.get('Location'), `https://job-hopper.io/unsubscribe?token=${encodeURIComponent(token)}`)
  assertEquals(applied.length, 0)

  const noToken = await handler(new Request(FN_URL))
  assertEquals(noToken.headers.get('Location'), 'https://job-hopper.io/unsubscribe')
  assertEquals(applied.length, 0)
})

Deno.test('POST one-click (RFC 8058) unsubscribes with the token scope', async () => {
  const { handler, applied } = harness()
  const res = await handler(oneClick(await marketingToken()))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { ok: true, email: 'reader@example.com', scope: 'marketing' })
  assertEquals(applied, [{ email: 'reader@example.com', profileId: 'p-1', scope: 'marketing' }])
})

Deno.test('POST one-click also accepts multipart/form-data', async () => {
  const { handler, applied } = harness()
  const form = new FormData()
  form.set('List-Unsubscribe', 'One-Click')
  const res = await handler(new Request(`${FN_URL}?token=${encodeURIComponent(await marketingToken())}`, { method: 'POST', body: form }))
  assertEquals(res.status, 200)
  assertEquals(applied.length, 1)
})

Deno.test('POST with a query token but no one-click body is rejected', async () => {
  const { handler, applied } = harness()
  const token = encodeURIComponent(await marketingToken())
  for (const init of [
    { method: 'POST' },
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=Nope' },
  ]) {
    const res = await handler(new Request(`${FN_URL}?token=${token}`, init))
    assertEquals(res.status, 400)
  }
  assertEquals(applied.length, 0)
})

Deno.test('JSON POST from the confirm page works', async () => {
  const { handler, applied } = harness()
  const res = await handler(jsonPost(await marketingToken()))
  assertEquals(res.status, 200)
  assertEquals(applied.length, 1)
  assertEquals(applied[0].scope, 'marketing')
})

Deno.test('v1 (legacy) token is still accepted, as scope all for its profile', async () => {
  const { handler, applied } = harness()
  const token = await legacyV1Token('p-legacy', Math.floor(Date.now() / 1000) + 3600)
  const res = await handler(jsonPost(token))
  assertEquals(res.status, 200)
  assertEquals(applied, [{ email: null, profileId: 'p-legacy', scope: 'all' }])
})

Deno.test('expired tokens are rejected (v2 and v1)', async () => {
  const { handler, applied } = harness()
  const expiredV2 = await createUnsubscribeToken({ email: 'a@example.com', scope: 'marketing' }, SECRET, -60)
  const expiredV1 = await legacyV1Token('p-1', Math.floor(Date.now() / 1000) - 60)
  for (const token of [expiredV2, expiredV1]) {
    const res = await handler(jsonPost(token))
    assertEquals(res.status, 400)
    assertEquals((await res.json()).error, 'invalid_token')
  }
  assertEquals(applied.length, 0)
})

Deno.test('tampered tokens are rejected', async () => {
  const { handler, applied } = harness()
  const token = await marketingToken()
  const [payload, sig] = token.split('.')
  const forgedPayload = b64url(new TextEncoder().encode(JSON.stringify({ v: 2, email_normalized: 'victim@example.com', scope: 'all', exp: 9999999999 })))
  const otherSecret = await createUnsubscribeToken({ email: 'a@example.com', scope: 'all' }, 'other-secret')
  for (const bad of [`${forgedPayload}.${sig}`, `${payload}.${sig.slice(0, -2)}xx`, otherSecret, 'not-a-token', `${payload}.`, '.']) {
    const res = await handler(jsonPost(bad))
    assertEquals(res.status, 400, bad)
  }
  assertEquals(applied.length, 0)
})

Deno.test('double POST with the same token succeeds both times without a duplicate', async () => {
  const { handler, rows } = harness()
  const token = await marketingToken()
  assertEquals((await handler(oneClick(token))).status, 200)
  assertEquals((await handler(jsonPost(token))).status, 200)
  assertEquals(rows.size, 1)
})

Deno.test('POST without UNSUBSCRIBE_EMAIL_SECRET is a server error, not a silent success', async () => {
  const { handler, applied } = harness({ secret: undefined })
  const res = await handler(jsonPost(await marketingToken()))
  assertEquals(res.status, 500)
  assertEquals(applied.length, 0)
})

Deno.test('a failed write is reported as an error', async () => {
  const handler = createUnsubscribeHandler({
    secret: SECRET,
    siteUrl: 'https://job-hopper.io',
    applyUnsubscribe: () => Promise.reject(new Error('db down')),
  })
  const res = await handler(jsonPost(await marketingToken()))
  assertEquals(res.status, 500)
})

// --- token + footer links ---

Deno.test('v2 token round-trip carries the normalized email, ids and scope', async () => {
  const token = await createUnsubscribeToken({ email: ' A.B@Example.com\t', profileId: 'p-9', prospectId: 'x-1', scope: 'all' }, SECRET)
  const verified = await verifyUnsubscribeToken(token, SECRET)
  assert(verified && verified.v === 2)
  assertEquals(verified.email_normalized, 'a.b@example.com')
  assertEquals(verified.profile_id, 'p-9')
  assertEquals(verified.prospect_id, 'x-1')
  assertEquals(verified.scope, 'all')
  assertEquals(normalizeEmail('  MiXed@Case.COM \n'), 'mixed@case.com')
})

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  return async () => {
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, Deno.env.get(k)]))
    for (const [k, v] of Object.entries(env)) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v)
    try {
      await fn()
    } finally {
      for (const [k, v] of Object.entries(saved)) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v)
    }
  }
}

const FULL_ENV = { UNSUBSCRIBE_EMAIL_SECRET: SECRET, SUPABASE_URL: 'https://proj.supabase.co', SITE_URL: 'https://job-hopper.io' }

Deno.test('getFooterLinksForProfile builds a valid signed link', withEnv(FULL_ENV, async () => {
  const links = await getFooterLinksForProfile('p-1', 'Reader@Example.com', 'marketing')
  assert(isValidUnsubscribeUrl(links.unsubscribeUrl))
  assert(links.unsubscribeUrl.startsWith(`${FN_URL}?token=`))
  assertEquals(links.preferencesUrl, 'https://job-hopper.io/profile')
  const token = new URL(links.unsubscribeUrl).searchParams.get('token')!
  const verified = await verifyUnsubscribeToken(token, SECRET)
  assert(verified && verified.v === 2 && verified.email_normalized === 'reader@example.com' && verified.scope === 'marketing')
}))

Deno.test('getFooterLinksForProfile throws when the secret is missing', withEnv({ ...FULL_ENV, UNSUBSCRIBE_EMAIL_SECRET: undefined }, async () => {
  await assertRejects(() => getFooterLinksForProfile('p-1', 'a@example.com', 'marketing'), Error, 'UNSUBSCRIBE_EMAIL_SECRET')
}))

Deno.test('getFooterLinksForProfile throws when SUPABASE_URL is missing', withEnv({ ...FULL_ENV, SUPABASE_URL: undefined }, async () => {
  await assertRejects(() => getFooterLinksForProfile('p-1', 'a@example.com', 'all'), Error, 'SUPABASE_URL')
}))

Deno.test('transactional footer falls back to the preferences page, which sendEmail rejects for marketing', withEnv({ ...FULL_ENV, UNSUBSCRIBE_EMAIL_SECRET: undefined }, async () => {
  const links = await getTransactionalFooterLinks('p-1', 'a@example.com')
  assertEquals(links.unsubscribeUrl, 'https://job-hopper.io/profile')
  assertEquals(isValidUnsubscribeUrl(links.unsubscribeUrl), false)
}))
