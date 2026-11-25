import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { ChatMessage } from '../llm.ts'
import { draftProblems } from '../reply-assist.ts'
import { B2C_REPLY_CLASSIFICATION_SYSTEM, REPLY_CLASSIFICATION_SYSTEM } from '../reply-classification-prompt.ts'
import { MAX_CLASSIFY_ATTEMPTS, processReply, type ProcessedPatch, type ReplyProcessingDeps, type ReplyRow } from '../reply-processing.ts'

const SITE = 'https://job-hopper.io'
const OWNER = 'owner-profile-1'

/** Realistic job-seeker replies and the label the (mocked) model gives each. */
const B2C_SAMPLES: Record<string, string> = {
  interested: "This sounds great, I'd love to try it. I've been job hunting for two months.",
  role_request: 'Can you send me junior UX designer roles in Seattle or remote? Ideally with visa sponsorship.',
  pricing: "What's the difference between Core and Premium and how much is Premium?",
  assistance: "I can't upload my resume, the page just keeps spinning. Can you help?",
  not_now: "Thanks, I'm swamped with finals right now. Maybe check back in January.",
  not_interested: 'No thanks, not for me.',
  already_employed: 'Good news, I accepted an offer last week so I am not looking anymore.',
  unsubscribe: 'Please remove me from your mailing list.',
  out_of_office: 'I am out of the office until December 2 with limited access to email.',
  other: 'Is this the same company that ran the career fair at UT?',
}

type Llm = ReplyProcessingDeps['llm']
const seenPrompts: { purpose: string; messages: ChatMessage[] }[] = []

/** classify -> the label for the sample; extract -> fixed JSON; draft -> `draft`. */
function mockLlm(label: string, opts: { draft?: string; classifyFails?: boolean } = {}): Llm {
  return (messages, purpose) => {
    seenPrompts.push({ purpose, messages })
    if (purpose === 'classify') return Promise.resolve(opts.classifyFails ? { ok: false, error: 'timeout' } : { ok: true, content: label })
    if (purpose === 'extract') {
      return Promise.resolve({ ok: true, content: '{"need":"Wants junior UX roles","roles":["UX Designer"],"locations":["Seattle","Remote"],"timeline":null,"question":null,"sentiment":"positive"}' })
    }
    return Promise.resolve({ ok: true, content: opts.draft ?? 'Thanks for your reply! We will get back to you shortly.\n\nThe Job-Hopper team' })
  }
}

function harness(llm: Llm, over: Partial<ReplyProcessingDeps> = {}) {
  const calls: string[] = []
  const saved: { id: string; patch: ProcessedPatch }[] = []
  const failures: { id: string; attempts: number; error: string; manual: boolean }[] = []
  const deps: ReplyProcessingDeps = {
    llm,
    suppressSender: (email) => (calls.push(`suppress ${email}`), Promise.resolve()),
    findLeadOrganization: () => Promise.resolve('State University'),
    excludeCompany: (org) => (calls.push(`exclude ${org}`), Promise.resolve()),
    markLeadReplied: (id, c) => (calls.push(`lead ${id} ${c}`), Promise.resolve()),
    markProspectReplied: (id) => (calls.push(`prospect ${id}`), Promise.resolve()),
    saveProcessed: (id, patch) => (calls.push('save'), saved.push({ id, patch }), Promise.resolve()),
    recordFailure: (id, attempts, error, manual) => (failures.push({ id, attempts, error, manual }), Promise.resolve()),
    defaultOwner: OWNER,
    siteUrl: SITE,
    now: () => new Date('2026-11-24T12:00:00Z'),
    ...over,
  }
  return { deps, calls, saved, failures }
}

const reply = (over: Partial<ReplyRow> = {}): ReplyRow => ({
  id: 'r1',
  institutional_lead_id: null,
  prospect_id: 'p1',
  profile_id: null,
  from_email: 'maria.lopez@gmail.com',
  raw_subject: 'Re: Your Job-Hopper matches',
  raw_body: 'hello',
  received_at: '2026-11-24T10:00:00.000Z',
  classify_attempts: 0,
  ...over,
})

Deno.test('every job-seeker class routes through the b2c prompt to the right class, action and draft', async () => {
  for (const [label, body] of Object.entries(B2C_SAMPLES)) {
    seenPrompts.length = 0
    const h = harness(mockLlm(label))
    const out = await processReply(h.deps, reply({ raw_body: body }))
    assertEquals(out.status, 'processed', label)
    const patch = h.saved[0].patch
    assertEquals([patch.reply_class, patch.audience], [label, 'b2c'], label)
    assertEquals(seenPrompts[0].messages[0].content, B2C_REPLY_CLASSIFICATION_SYSTEM, label)
    const noDraft = ['unsubscribe', 'out_of_office', 'not_interested'].includes(label)
    assertEquals(patch.draft_response === null, noDraft, label)
    assertEquals(seenPrompts.some((p) => p.purpose === 'draft'), !noDraft, label)
    const noAction = ['not_interested', 'already_employed', 'unsubscribe'].includes(label)
    assertEquals(patch.next_action === null, noAction, label)
    assertEquals(patch.assigned_to, noAction ? null : OWNER, label)
  }
})

Deno.test('a profile match (no prospect) is also b2c; a lead match is b2b even if also a prospect', async () => {
  seenPrompts.length = 0
  await processReply(harness(mockLlm('interested')).deps, reply({ prospect_id: null, profile_id: 'u1' }))
  assertEquals(seenPrompts[0].messages[0].content, B2C_REPLY_CLASSIFICATION_SYSTEM)
  seenPrompts.length = 0
  const h = harness(mockLlm('Meeting requested'))
  await processReply(h.deps, reply({ institutional_lead_id: 'l1', prospect_id: 'p1', raw_body: 'Can we do a call Thursday at 2?' }))
  assertEquals(seenPrompts[0].messages[0].content, REPLY_CLASSIFICATION_SYSTEM)
  assertEquals([h.saved[0].patch.reply_class, h.saved[0].patch.audience, h.saved[0].patch.next_action], ['Meeting requested', 'b2b', 'schedule meeting'])
})

Deno.test('a b2c-only label from the b2b prompt (or vice versa) is not accepted', async () => {
  const h = harness(mockLlm('role_request'))
  assertEquals((await processReply(h.deps, reply({ institutional_lead_id: 'l1' }))).status, 'retry')
  const b = harness(mockLlm('Meeting requested'))
  assertEquals((await processReply(b.deps, reply())).status, 'retry')
  assertEquals(h.saved.length + b.saved.length, 0)
})

Deno.test('the LLM never sees the sender address, signature or phone numbers', async () => {
  seenPrompts.length = 0
  const body = `${B2C_SAMPLES.role_request}\n\nBest regards,\nMaria Lopez\n+1 512 555 0134\nmaria.lopez@gmail.com`
  await processReply(harness(mockLlm('role_request')).deps, reply({ raw_body: body }))
  const sent = JSON.stringify(seenPrompts)
  for (const leaked of ['maria.lopez@gmail.com', 'Maria Lopez', '555 0134']) assertEquals(sent.includes(leaked), false, leaked)
  assert(sent.includes('junior UX designer roles'))
})

Deno.test('extraction is stored on the reply', async () => {
  const h = harness(mockLlm('role_request'))
  await processReply(h.deps, reply({ raw_body: B2C_SAMPLES.role_request }))
  assertEquals(h.saved[0].patch.extracted, { need: 'Wants junior UX roles', roles: ['UX Designer'], locations: ['Seattle', 'Remote'], timeline: null, question: null, sentiment: 'positive' })
})

Deno.test('unsubscribe suppresses the sender immediately, before anything else is written', async () => {
  const h = harness(mockLlm('unsubscribe'))
  const out = await processReply(h.deps, reply({ raw_body: B2C_SAMPLES.unsubscribe }))
  assertEquals(h.calls, ['suppress maria.lopez@gmail.com', 'prospect p1', 'save'])
  assert(out.status === 'processed' && out.unsubscribed)
  assertEquals(h.saved[0].patch.extracted, null) // nothing extracted from an opt-out
})

Deno.test('a lead unsubscribe suppresses, writes back the class and excludes the company', async () => {
  const h = harness(mockLlm('Unsubscribe'))
  const out = await processReply(h.deps, reply({ institutional_lead_id: 'l1', prospect_id: null, raw_body: 'Take us off your list.' }))
  assertEquals(h.calls, ['suppress maria.lopez@gmail.com', 'lead l1 Unsubscribe', 'exclude State University', 'save'])
  assert(out.status === 'processed' && out.companyExcluded)
})

Deno.test('a failed suppression is retried without using up a classification attempt', async () => {
  const h = harness(mockLlm('unsubscribe'), { suppressSender: () => Promise.reject(new Error('db down')) })
  const out = await processReply(h.deps, reply({ classify_attempts: MAX_CLASSIFY_ATTEMPTS - 1 }))
  assertEquals(out.status, 'suppression_retry')
  assertEquals(h.failures.length + h.saved.length, 0)
})

Deno.test('a failed classification is retried, then flagged for manual review', async () => {
  for (let attempts = 0; attempts < MAX_CLASSIFY_ATTEMPTS; attempts++) {
    const h = harness(mockLlm('x', { classifyFails: true }))
    const out = await processReply(h.deps, reply({ classify_attempts: attempts }))
    const last = attempts + 1 === MAX_CLASSIFY_ATTEMPTS
    assertEquals(out.status, last ? 'manual_review' : 'retry')
    assertEquals(h.failures, [{ id: 'r1', attempts: attempts + 1, error: 'classification failed: timeout', manual: last }])
    assertEquals(h.saved.length, 0)
  }
  // An unknown label counts the same way.
  const h = harness(mockLlm('Maybe?'))
  assertEquals((await processReply(h.deps, reply())).status, 'retry')
  assert(h.failures[0].error.startsWith('unrecognized class'))
})

Deno.test('drafts never carry prices, invented jobs or sponsorship claims (mocked bad drafts)', async () => {
  const badDrafts = [
    'Premium is just $19.99/month and Core is $9.99!',
    'Great news: we found 14 new jobs for UX designers in Seattle.',
    'Amazon is hiring right now and they will sponsor your visa.',
  ]
  for (const label of ['pricing', 'role_request', 'interested'] as const) {
    for (const bad of badDrafts) {
      const h = harness(mockLlm(label, { draft: bad }))
      const out = await processReply(h.deps, reply({ raw_body: B2C_SAMPLES[label] }))
      const draft = h.saved[0].patch.draft_response!
      assertEquals(draftProblems(draft), [], `${label}: ${draft}`)
      assertEquals(draft.includes('$'), false)
      assert(out.status === 'processed' && out.draftFallback)
      if (label === 'pricing') assert(draft.includes(`${SITE}/pricing`))
    }
  }
})

Deno.test('a clean pricing draft gets the pricing link; no draft is ever sent (no send dependency exists)', async () => {
  const h = harness(mockLlm('pricing', { draft: 'Happy to explain the plans. Let us know which features matter most to you.' }))
  await processReply(h.deps, reply({ raw_body: B2C_SAMPLES.pricing }))
  assert(h.saved[0].patch.draft_response!.includes(`${SITE}/pricing`))
  assertEquals(h.saved[0].patch.draft_generated_at, '2026-11-24T12:00:00.000Z')
  assertEquals(Object.keys(h.deps).filter((k) => /^(send|email|mail)/i.test(k)), [])
})

Deno.test('write-back: lead gets class + replied, prospect gets replied, before the reply is saved', async () => {
  const h = harness(mockLlm('Interested'))
  await processReply(h.deps, reply({ institutional_lead_id: 'l1', prospect_id: 'p1', raw_body: 'Yes, interested.' }))
  assertEquals(h.calls, ['lead l1 Interested', 'prospect p1', 'save'])
  const p = harness(mockLlm('interested'))
  await processReply(p.deps, reply({ raw_body: B2C_SAMPLES.interested }))
  assertEquals(p.calls, ['prospect p1', 'save'])
})

Deno.test('a failed write-back leaves the reply unprocessed and counts an attempt', async () => {
  const h = harness(mockLlm('interested'), { markProspectReplied: () => Promise.reject(new Error('timeout')) })
  const out = await processReply(h.deps, reply())
  assertEquals(out.status, 'retry')
  assertEquals(h.saved.length, 0)
  assertEquals(h.failures[0].error, 'write-back failed: timeout')
})

Deno.test('owner and due date: default owner only when there is something to do', async () => {
  const h = harness(mockLlm('not_now'), { defaultOwner: null })
  await processReply(h.deps, reply({ raw_body: B2C_SAMPLES.not_now }))
  assertEquals([h.saved[0].patch.next_action, h.saved[0].patch.next_action_due, h.saved[0].patch.assigned_to], ['follow up', '2026-12-24T10:00:00.000Z', null])
})
