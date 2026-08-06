import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { extractOutreachDraft, outreachDraftUserMessage } from '../outreach-draft-prompt.ts'

Deno.test('outreachDraftUserMessage: fills blanks and includes role/pay/candidate name', () => {
  const msg = outreachDraftUserMessage({
    employerCompanyName: 'Acme Co',
    roleTitle: 'Senior Backend Engineer',
    payMin: 140000,
    payMax: 170000,
    payType: 'year',
    candidateFirstName: 'Jordan',
    candidateJobTitle: null,
    candidateCareerLevel: null,
    candidateYearsOfExperience: null,
  })
  assertEquals(msg.includes('Senior Backend Engineer'), true)
  assertEquals(msg.includes('$140,000 - $170,000 / year'), true)
  assertEquals(msg.includes('Jordan'), true)
})

Deno.test('extractOutreachDraft: parses fenced JSON', () => {
  const raw = '```json\n{"subject": "Quick intro", "body": "Hi Jordan, ..."}\n```'
  assertEquals(extractOutreachDraft(raw), { subject: 'Quick intro', body: 'Hi Jordan, ...' })
})

Deno.test('extractOutreachDraft: returns null on garbage, missing fields, or blanks', () => {
  assertEquals(extractOutreachDraft('not json'), null)
  assertEquals(extractOutreachDraft(null), null)
  assertEquals(extractOutreachDraft(undefined), null)
  assertEquals(extractOutreachDraft('{"subject": "only subject"}'), null)
  assertEquals(extractOutreachDraft('{"subject": "  ", "body": "text"}'), null)
})
