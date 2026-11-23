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
const UNSUB_URL = 'https://proj.supabase.co/functions/v1/unsubscribe-email?token=abc.def'
const notSuppressed: SuppressionCheck = () => Promise.resolve(false)

Deno.test('marketing without a valid unsubscribe link is refused before any check or send', async () => {
  for (const unsubscribeUrl of [undefined, null, '', '#', 'https://job-hopper.io/profile?unsubscribe=1', 'https://x.co/functions/v1/unsubscribe-email']) {
    const provider = fakeProvider()
    let checked = false
    const result = await sendEmail(
      { kind: 'marketing', unsubscribeUrl, to: 'a@example.com', subject: 's' },
      { isSuppressed: () => { checked = true; return Promise.resolve(false) }, send: provider.send },
    )
    assertEquals(result.success, false, String(unsubscribeUrl))
    assert(result.error?.includes('no valid unsubscribe link'))
    assertEquals(provider.sent.length, 0)
    assertEquals(checked, false)
  }
})

Deno.test('transactional without an unsubscribe link still sends', async () => {
  const provider = fakeProvider()
  const result = await sendEmail({ kind: 'transactional', to: 'a@example.com', subject: 'receipt' }, { isSuppressed: notSuppressed, send: provider.send })
  assertEquals(result.success, true)
  assertEquals(provider.sent.length, 1)
})

Deno.test('suppressed address: marketing send is blocked before the provider', async () => {
  const provider = fakeProvider()
  const result = await sendEmail(
    { kind: 'marketing', unsubscribeUrl: UNSUB_URL, to: 'gone@example.com', subject: 's' },
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
    const result = await sendEmail({ kind, unsubscribeUrl: UNSUB_URL, to: 'bounced@example.com', subject: 's' }, { isSuppressed: check, send: provider.send })
    assertEquals(result.success, false, kind)
    assertEquals(provider.sent.length, 0, kind)
  }
})

Deno.test('mixed-case / padded address is matched against the normalized list', async () => {
  const provider = fakeProvider()
  const result = await sendEmail(
    { kind: 'marketing', unsubscribeUrl: UNSUB_URL, to: '  Gone@Example.COM\t', subject: 's' },
    { isSuppressed: fakeSuppressionList({ 'gone@example.com': 'all' }), send: provider.send },
  )
  assertEquals(result.success, false)
  assertEquals(provider.sent.length, 0)
})

Deno.test('check error: marketing is blocked (fail closed)', async () => {
  const provider = fakeProvider()
  const result = await sendEmail({ kind: 'marketing', unsubscribeUrl: UNSUB_URL, to: 'a@example.com', subject: 's' }, { isSuppressed: failingCheck, send: provider.send })
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
    from: () => ({
      insert: (row: unknown) => {
        inserted.push(row as Record<string, unknown>)
        return Promise.resolve({ error: null })
      },
    }),
  }
  await sendEmail(
    { kind: 'marketing', unsubscribeUrl: UNSUB_URL, to: 'gone@example.com', subject: 's', profileId: 'p1', eventType: 'system_announcement', supabase },
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
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) Deno.env.delete(k)
      else Deno.env.set(k, v)
    }
    globalThis.fetch = fetchImpl
    try {
      await fn()
    } finally {
      globalThis.fetch = savedFetch
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) Deno.env.delete(k)
        else Deno.env.set(k, v)
      }
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

// --- List-Unsubscribe headers (step 2b) ---

Deno.test('marketing send carries List-Unsubscribe + List-Unsubscribe-Post with the footer URL', async () => {
  const provider = fakeProvider()
  await sendEmail({ kind: 'marketing', unsubscribeUrl: UNSUB_URL, to: 'a@example.com', subject: 's' }, { isSuppressed: notSuppressed, send: provider.send })
  assertEquals(provider.sent[0].headers, {
    'List-Unsubscribe': `<${UNSUB_URL}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  })
})

Deno.test('transactional send carries no List-Unsubscribe headers', async () => {
  const provider = fakeProvider()
  await sendEmail({ kind: 'transactional', unsubscribeUrl: UNSUB_URL, to: 'a@example.com', subject: 's' }, { isSuppressed: notSuppressed, send: provider.send })
  assertEquals(provider.sent[0].headers, undefined)
})

// --- send log (step 3) ---

Deno.test('logged row carries to_email_normalized and campaign', async () => {
  const inserted: Record<string, unknown>[] = []
  const supabase = {
    from: () => ({
      insert: (row: unknown) => (inserted.push(row as Record<string, unknown>), Promise.resolve({ error: null })),
    }),
  }
  await sendEmail(
    { kind: 'transactional', to: '  Reader@Example.COM ', subject: 's', profileId: 'p1', eventType: 'job_match_digest', campaign: 'winter-digest', supabase },
    { isSuppressed: notSuppressed, send: fakeProvider().send },
  )
  await sendEmail(
    { kind: 'transactional', to: 'b@example.com', subject: 's', profileId: 'p1', eventType: 'job_match_digest', supabase },
    { isSuppressed: notSuppressed, send: fakeProvider().send },
  )
  assertEquals(inserted[0].to_email_normalized, 'reader@example.com')
  assertEquals(inserted[0].campaign, 'winter-digest')
  assertEquals(inserted[0].provider_message_id, 'msg-1')
  assertEquals(inserted[1].campaign, null)
})
