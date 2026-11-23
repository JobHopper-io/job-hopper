import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  cleanReplyText,
  draftProblems,
  fallbackDraft,
  guardDraft,
  needsDraft,
  NEXT_ACTIONS,
  nextActionFor,
  parseExtraction,
} from '../reply-assist.ts'
import { B2C_REPLY_CLASSES, REPLY_CLASSES } from '../reply-classification-prompt.ts'

const SITE = 'https://job-hopper.io'

Deno.test('cleanReplyText drops the signature, quoted thread and contact details', () => {
  const body = `Hi, yes please send me data analyst roles in Austin or remote.
You can also call me on +1 (512) 555-0134 or write to maria.lopez@gmail.com.

Thanks,
Maria Lopez
Senior Analyst, Acme Corp
(512) 555-0134

On Mon, Nov 23, 2026 at 9:00 AM Job-Hopper <hello@job-hopper.io> wrote:
> Your matches are ready
> https://job-hopper.io/dashboard`
  const text = cleanReplyText(body)
  assert(text.startsWith('Hi, yes please send me data analyst roles in Austin or remote.'))
  for (const leaked of ['Maria Lopez', 'Acme Corp', '555-0134', 'maria.lopez@gmail.com', 'wrote:', 'job-hopper.io', 'Your matches']) {
    assertEquals(text.includes(leaked), false, leaked)
  }
  assert(text.includes('[phone]') && text.includes('[email]'))
})

Deno.test('cleanReplyText: "--" separator, mobile footer, empty body', () => {
  assertEquals(cleanReplyText('Not right now, maybe in spring.\n-- \nJohn\nVP Talent'), 'Not right now, maybe in spring.')
  assertEquals(cleanReplyText('Stop emailing me\n\nSent from my iPhone'), 'Stop emailing me')
  assertEquals(cleanReplyText(null), '')
  // A first line that is only "Thanks" isn't mistaken for the signature start.
  assertEquals(cleanReplyText('Thanks!\nWhat does Core cost?'), 'Thanks!\nWhat does Core cost?')
})

Deno.test('parseExtraction: valid JSON, fenced JSON, caps and personal data stripped', () => {
  const e = parseExtraction('```json\n{"need":"Wants remote data analyst roles","roles":["Data Analyst","x@y.com"],"locations":["Austin","Remote"],"timeline":"by January","question":"Can you call me at 512-555-0134?","sentiment":"positive"}\n```')
  assertEquals(e, {
    need: 'Wants remote data analyst roles',
    roles: ['Data Analyst'],
    locations: ['Austin', 'Remote'],
    timeline: 'by January',
    question: 'Can you call me at [phone]?',
    sentiment: 'positive',
  })
  assertEquals(parseExtraction('not json'), null)
  assertEquals(parseExtraction('[1,2]'), null)
  assertEquals(parseExtraction('{"sentiment":"ecstatic"}')?.sentiment, 'neutral')
  assertEquals(parseExtraction(JSON.stringify({ need: 'x'.repeat(500) }))?.need?.length, 120)
})

Deno.test('drafts: none for unsubscribe, out of office, not interested (both class sets)', () => {
  for (const c of ['unsubscribe', 'out_of_office', 'not_interested', 'Unsubscribe', 'Out of office', 'Not interested'] as const) {
    assertEquals(needsDraft(c), false, c)
  }
  for (const c of ['interested', 'role_request', 'pricing', 'assistance', 'not_now', 'already_employed', 'other', 'Pricing question'] as const) {
    assertEquals(needsDraft(c), true, c)
  }
})

Deno.test('draft guard catches prices, invented jobs and sponsorship claims', () => {
  const bad = [
    ['Core is $9.99 a month.', 'price'],
    ['Premium costs 19 USD per month.', 'price'],
    ['You can get 20% off this week.', 'price'],
    ['We found 12 new jobs for you in Austin!', 'invented_jobs'],
    ['I have a few openings lined up for you.', 'invented_jobs'],
    ['Google is hiring data analysts right now.', 'invented_jobs'],
    ['These employers will sponsor your visa.', 'sponsorship'],
    ['Visa sponsorship is guaranteed with Premium.', 'sponsorship'],
  ] as const
  for (const [text, problem] of bad) assert(draftProblems(text).includes(problem), text)
  const good = [
    'Thanks! All plans are on our pricing page: https://job-hopper.io/pricing. The Job-Hopper team',
    'Thanks for telling us what you need. We\'ll check your matches and get back to you.',
    'Our sponsorship data comes from DOL filings, so you can see which employers have sponsored before.',
  ]
  for (const text of good) assertEquals(draftProblems(text), [], text)
})

Deno.test('guardDraft: a rule-breaking LLM draft is replaced; pricing always links to /pricing', () => {
  const r = guardDraft('Sure! Core is $9.99/month and we found 5 jobs for you.', 'pricing', SITE)
  assertEquals(r.usedFallback, true)
  assertEquals(r.draft, fallbackDraft('pricing', SITE))
  assert(r.draft.includes(`${SITE}/pricing`))
  assertEquals(draftProblems(r.draft), [])

  const ok = guardDraft('Happy to help with plans. Let us know what you need.', 'pricing', SITE)
  assertEquals(ok.usedFallback, false)
  assert(ok.draft.endsWith(`Plans and pricing: ${SITE}/pricing`))
  assertEquals(guardDraft(null, 'assistance', SITE).usedFallback, true)
})

Deno.test('every fallback draft is clean and has no prices or invented jobs', () => {
  for (const c of [...B2C_REPLY_CLASSES, ...REPLY_CLASSES]) {
    if (!needsDraft(c)) continue
    assertEquals(draftProblems(fallbackDraft(c, SITE)), [], c)
  }
})

Deno.test('next actions per class; due from the reply time', () => {
  const at = '2026-11-24T10:00:00.000Z'
  assertEquals(nextActionFor('interested', at), { next_action: 'send shortlist', next_action_due: '2026-11-25T10:00:00.000Z' })
  assertEquals(nextActionFor('pricing', at), { next_action: 'answer pricing', next_action_due: '2026-11-25T10:00:00.000Z' })
  assertEquals(nextActionFor('not_now', at), { next_action: 'follow up', next_action_due: '2026-12-24T10:00:00.000Z' })
  assertEquals(nextActionFor('already_employed', at), { next_action: null, next_action_due: null })
  assertEquals(nextActionFor('unsubscribe', at).next_action, null)
  // Every class in both sets has an entry.
  for (const c of [...B2C_REPLY_CLASSES, ...REPLY_CLASSES]) assert(c in NEXT_ACTIONS, c)
})
