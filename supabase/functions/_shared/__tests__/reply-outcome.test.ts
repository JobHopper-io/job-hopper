import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { recordClassifiedReply, type ReplyOutcomeDeps } from '../reply-outcome.ts'

function fakeDeps(overrides: Partial<ReplyOutcomeDeps> = {}) {
  const calls: string[] = []
  const deps: ReplyOutcomeDeps = {
    suppressSender: (email) => (calls.push(`suppress:${email}`), Promise.resolve()),
    markClassified: (id, cls) => (calls.push(`mark:${id}:${cls}`), Promise.resolve()),
    findLeadOrganization: (id) => (calls.push(`lead:${id}`), Promise.resolve('Acme U')),
    excludeCompany: (name) => (calls.push(`exclude:${name}`), Promise.resolve()),
    ...overrides,
  }
  return { deps, calls }
}

const matched = { id: 'r1', institutional_lead_id: 'lead-1', from_email: 'dean@acme.edu' }
const unmatched = { id: 'r2', institutional_lead_id: null, from_email: 'Someone@Else.com' }

Deno.test('Unsubscribe matched to a lead: sender suppressed first, then processed, then company excluded', async () => {
  const { deps, calls } = fakeDeps()
  assertEquals(await recordClassifiedReply(deps, matched, 'Unsubscribe'), 'unsubscribed')
  assertEquals(calls, ['suppress:dean@acme.edu', 'mark:r1:Unsubscribe', 'lead:lead-1', 'exclude:Acme U'])
})

Deno.test('Unsubscribe with no matched lead still suppresses the sender (no company exclusion)', async () => {
  const { deps, calls } = fakeDeps()
  assertEquals(await recordClassifiedReply(deps, unmatched, 'Unsubscribe'), 'unsubscribed_unmatched')
  assertEquals(calls, ['suppress:Someone@Else.com', 'mark:r2:Unsubscribe'])
})

Deno.test('failed sender suppression leaves the reply unprocessed for a retry', async () => {
  const { deps, calls } = fakeDeps({ suppressSender: () => Promise.reject(new Error('db down')) })
  assertEquals(await recordClassifiedReply(deps, matched, 'Unsubscribe'), 'retry')
  assertEquals(calls, [])
})

Deno.test('non-Unsubscribe classes never suppress or exclude', async () => {
  for (const cls of ['Interested', 'Not interested', null]) {
    const { deps, calls } = fakeDeps()
    assertEquals(await recordClassifiedReply(deps, matched, cls), 'classified')
    assertEquals(calls, [`mark:r1:${cls}`])
  }
})

Deno.test('exclusion_lists failure is an error, but the sender stays suppressed', async () => {
  const { deps, calls } = fakeDeps({ excludeCompany: () => Promise.reject(new Error('db down')) })
  assertEquals(await recordClassifiedReply(deps, matched, 'Unsubscribe'), 'error')
  assertEquals(calls[0], 'suppress:dean@acme.edu')
})
