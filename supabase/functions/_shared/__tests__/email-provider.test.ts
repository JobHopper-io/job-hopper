import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseFromAddress, sendEmailViaProvider } from '../email-provider.ts'

Deno.test('parseFromAddress splits "Name <email>" into separate fields', () => {
  assertEquals(parseFromAddress('Job-Hopper <no-reply@job-hopper.com>', 'fallback'), {
    email: 'no-reply@job-hopper.com',
    name: 'Job-Hopper',
  })
})

Deno.test('parseFromAddress handles a quoted display name', () => {
  assertEquals(parseFromAddress('"Job-Hopper Team" <no-reply@job-hopper.com>', 'fallback'), {
    email: 'no-reply@job-hopper.com',
    name: 'Job-Hopper Team',
  })
})

Deno.test('parseFromAddress leaves a bare address as-is and uses the fallback name', () => {
  assertEquals(parseFromAddress('no-reply@job-hopper.io', 'Job-Hopper'), {
    email: 'no-reply@job-hopper.io',
    name: 'Job-Hopper',
  })
})

Deno.test('sendEmailViaProvider passes headers through as Mailtrap\'s `headers` object, and omits it when empty', async () => {
  const bodies: Record<string, unknown>[] = []
  const savedFetch = globalThis.fetch
  const savedToken = Deno.env.get('MAILTRAP_API_TOKEN')
  Deno.env.set('MAILTRAP_API_TOKEN', 'test-token')
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    return Promise.resolve(new Response('{"success":true,"message_ids":["m1"]}', { status: 200 }))
  }) as typeof fetch
  try {
    const headers = { 'List-Unsubscribe': '<https://x/unsubscribe-email?token=t>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    await sendEmailViaProvider({ to: 'a@example.com', subject: 's', text: 't', headers })
    await sendEmailViaProvider({ to: 'a@example.com', subject: 's', text: 't', headers: {} })
    await sendEmailViaProvider({ to: 'a@example.com', subject: 's', text: 't' })
  } finally {
    globalThis.fetch = savedFetch
    if (savedToken === undefined) Deno.env.delete('MAILTRAP_API_TOKEN')
    else Deno.env.set('MAILTRAP_API_TOKEN', savedToken)
  }
  assertEquals(bodies[0].headers, {
    'List-Unsubscribe': '<https://x/unsubscribe-email?token=t>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  })
  assertEquals('headers' in bodies[1], false)
  assertEquals('headers' in bodies[2], false)
})

Deno.test('EMAIL_PROVIDER=log never calls Mailtrap and reports a log- message id', async () => {
  const realFetch = globalThis.fetch
  let fetched = 0
  globalThis.fetch = (() => (fetched++, Promise.reject(new Error('no network')))) as typeof fetch
  const logged: unknown[] = []
  const realLog = console.log
  console.log = (...args: unknown[]) => logged.push(args)
  Deno.env.set('EMAIL_PROVIDER', 'log')
  try {
    const r = await sendEmailViaProvider({ to: 'a@example.test', subject: 'Hi', campaign: 'recovery_cancelled_s1' })
    assertEquals(r.success, true)
    assertEquals(r.messageId?.startsWith('log-'), true)
    assertEquals(fetched, 0)
    assertEquals(JSON.stringify(logged).includes('recovery_cancelled_s1'), true)
  } finally {
    Deno.env.delete('EMAIL_PROVIDER')
    globalThis.fetch = realFetch
    console.log = realLog
  }
})

Deno.test('sendEmailViaProvider: fromName overrides the display name, replyTo becomes reply_to', async () => {
  const bodies: Record<string, unknown>[] = []
  const savedFetch = globalThis.fetch
  const savedToken = Deno.env.get('MAILTRAP_API_TOKEN')
  globalThis.fetch = ((_url: string, init: RequestInit) => (bodies.push(JSON.parse(String(init.body))), Promise.resolve(new Response('{"message_ids":["m1"]}', { status: 200 })))) as typeof fetch
  Deno.env.set('MAILTRAP_API_TOKEN', 'test-token')
  try {
    await sendEmailViaProvider({ to: 'a@example.com', subject: 's', text: 't', fromName: 'Job-Hopper Partnerships', replyTo: ' partnerships@job-hopper.co ' })
    await sendEmailViaProvider({ to: 'a@example.com', subject: 's', text: 't' })
  } finally {
    globalThis.fetch = savedFetch
    if (savedToken === undefined) Deno.env.delete('MAILTRAP_API_TOKEN')
    else Deno.env.set('MAILTRAP_API_TOKEN', savedToken)
  }
  assertEquals((bodies[0].from as { name: string }).name, 'Job-Hopper Partnerships')
  assertEquals(bodies[0].reply_to, { email: 'partnerships@job-hopper.co' })
  assertEquals('reply_to' in bodies[1], false)
})
