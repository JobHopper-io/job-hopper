import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { type EmailKind, isEmailSuppressed, sendEmail, type SuppressionCheck } from '../email.ts'
import type { SendEmailParams } from '../email-provider.ts'

// Mirrors is_email_suppressed()'s scope rule (scope 'all' blocks everything, scope
// 'marketing' blocks marketing only) and normalization; the SQL itself is tested in
// supabase/tests/suppressed_emails.test.sql.
function fakeSuppressionList(rows: Record<string, 'all' | 'marketing'>): SuppressionCheck & { calls: [string, EmailKind][] } {
  const calls: [string, EmailKind][] = []
  const check = (email: string, kind: EmailKind) => {
    calls.push([email, kind])
    const scope = rows[email.trim().toLowerCase()]
    return Promise.resolve(scope === 'all' || (scope === 'marketing' && kind === 'marketing'))
  }
  return Object.assign(check, { calls })
}

function fakeProvider() {
  const sent: SendEmailParams[] = []
  const send = (params: SendEmailParams) => {
    sent.push(params)
    return Promise.resolve({ success: true, messageId: 'msg-1' })
  }
  return { send, sent }
}

const failingCheck: SuppressionCheck = () => Promise.reject(new Error('rpc down'))

Deno.test('suppressed address: marketing send is blocked before the provider', async () => {
  const provider = fakeProvider()
  const result = await sendEmail(
    { kind: 'marketing', to: 'gone@example.com', subject: 's' },
    { isSuppressed: fakeSuppressionList({ 'gone@example.com': 'marketing' }), send: provider.send },
  )
  assertEquals(result.success, false)
  assertEquals(result.messageId, null)
  assert(result.error?.includes('suppressed'))
  assertEquals(provider.sent.length, 0)
})

Deno.test('marketing-only suppression: transactional send still goes out', async () => {
  const provider = fakeProvider()
  const check = fakeSuppressionList({ 'gone@example.com': 'marketing' })
  const result = await sendEmail(
    { kind: 'transactional', to: 'gone@example.com', subject: 'receipt' },
    { isSuppressed: check, send: provider.send },
  )
  assertEquals(result.success, true)
  assertEquals(provider.sent.length, 1)
  assertEquals(check.calls, [['gone@example.com', 'transactional']])
})

Deno.test('scope all: blocks both marketing and transactional', async () => {
  const check = fakeSuppressionList({ 'bounced@example.com': 'all' })
  for (const kind of ['marketing', 'transactional'] as const) {
    const provider = fakeProvider()
    const result = await sendEmail({ kind, to: 'bounced@example.com', subject: 's' }, { isSuppressed: check, send: provider.send })
    assertEquals(result.success, false, kind)
    assertEquals(provider.sent.length, 0, kind)
  }
})

Deno.test('mixed-case / padded address is matched against the normalized list', async () => {
  const provider = fakeProvider()
  const result = await sendEmail(
    { kind: 'marketing', to: '  Gone@Example.COM\t', subject: 's' },
    { isSuppressed: fakeSuppressionList({ 'gone@example.com': 'all' }), send: provider.send },
  )
  assertEquals(result.success, false)
  assertEquals(provider.sent.length, 0)
})

Deno.test('check error: marketing is blocked (fail closed)', async () => {
  const provider = fakeProvider()
  const result = await sendEmail({ kind: 'marketing', to: 'a@example.com', subject: 's' }, { isSuppressed: failingCheck, send: provider.send })
  assertEquals(result.success, false)
  assert(result.error?.includes('suppression check failed'))
  assertEquals(provider.sent.length, 0)
})

Deno.test('check error: transactional is still sent (fail open)', async () => {
  const provider = fakeProvider()
  const result = await sendEmail({ kind: 'transactional', to: 'a@example.com', subject: 's' }, { isSuppressed: failingCheck, send: provider.send })
  assertEquals(result.success, true)
  assertEquals(provider.sent.length, 1)
})

Deno.test('blocked send is still logged to email_events as failed', async () => {
  const inserted: Record<string, unknown>[] = []
  const supabase = {
    from: (_table: string) => ({
      insert: (row: unknown) => {
        inserted.push(row as Record<string, unknown>)
        return Promise.resolve({ error: null })
      },
    }),
  }
  await sendEmail(
    { kind: 'marketing', to: 'gone@example.com', subject: 's', profileId: 'p1', eventType: 'system_announcement', supabase },
    { isSuppressed: fakeSuppressionList({ 'gone@example.com': 'all' }), send: fakeProvider().send },
  )
  assertEquals(inserted.length, 1)
  assertEquals(inserted[0].status, 'failed')
  assert(String(inserted[0].error_message).includes('suppressed'))
})

// --- isEmailSuppressed: the real RPC client, with fetch stubbed ---

function withEnvAndFetch(env: Record<string, string | undefined>, fetchImpl: typeof fetch, fn: () => Promise<void>) {
  return async () => {
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, Deno.env.get(k)]))
    const savedFetch = globalThis.fetch
    for (const [k, v] of Object.entries(env)) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v)
    globalThis.fetch = fetchImpl
    try {
      await fn()
    } finally {
      globalThis.fetch = savedFetch
      for (const [k, v] of Object.entries(saved)) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v)
    }
  }
}

const ENV = { SUPABASE_URL: 'https://proj.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }

Deno.test(
  'isEmailSuppressed posts the raw address + kind to the RPC and returns its boolean',
  withEnvAndFetch(ENV, ((input: string | URL | Request, init?: RequestInit) => {
    assertEquals(String(input), 'https://proj.supabase.co/rest/v1/rpc/is_email_suppressed')
    assertEquals(JSON.parse(String(init?.body)), { p_email: ' X@Y.com', p_kind: 'marketing' })
    assertEquals((init?.headers as Record<string, string>).Authorization, 'Bearer service-key')
    return Promise.resolve(new Response('true', { status: 200 }))
  }) as typeof fetch, async () => {
    assertEquals(await isEmailSuppressed(' X@Y.com', 'marketing'), true)
  }),
)

Deno.test(
  'isEmailSuppressed throws on an RPC error, so sendEmail treats it as a failed check',
  withEnvAndFetch(ENV, (() => Promise.resolve(new Response('{"message":"boom"}', { status: 500 }))) as typeof fetch, async () => {
    await assertRejects(() => isEmailSuppressed('a@b.com', 'marketing'), Error, 'is_email_suppressed 500')
  }),
)

Deno.test(
  'isEmailSuppressed throws on a non-boolean body',
  withEnvAndFetch(ENV, (() => Promise.resolve(new Response('null', { status: 200 }))) as typeof fetch, async () => {
    await assertRejects(() => isEmailSuppressed('a@b.com', 'marketing'), Error, 'returned null')
  }),
)

Deno.test(
  'isEmailSuppressed throws when env is missing',
  withEnvAndFetch({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }, globalThis.fetch, async () => {
    await assertRejects(() => isEmailSuppressed('a@b.com', 'transactional'), Error, 'not set')
  }),
)
