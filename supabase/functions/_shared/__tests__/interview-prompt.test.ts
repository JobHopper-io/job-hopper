import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { extractInterviewTurn, interviewOpeningMessage } from '../interview-prompt.ts'

Deno.test('interviewOpeningMessage: fills blanks and includes job title', () => {
  const msg = interviewOpeningMessage({
    jobTitle: 'Welder',
    companyName: null,
    jobDescription: null,
    resumeText: null,
  })
  assertEquals(msg.includes('Welder'), true)
  assertEquals(msg.includes('no resume on file'), true)
})

Deno.test('extractInterviewTurn: parses fenced JSON with feedback', () => {
  const raw = '```json\n{"feedback": "Good, but be more specific.", "question": "Tell me about a conflict with a teammate."}\n```'
  assertEquals(extractInterviewTurn(raw), {
    feedback: 'Good, but be more specific.',
    question: 'Tell me about a conflict with a teammate.',
  })
})

Deno.test('extractInterviewTurn: first turn has null feedback', () => {
  const raw = JSON.stringify({ feedback: null, question: 'Walk me through your background.' })
  assertEquals(extractInterviewTurn(raw), { feedback: null, question: 'Walk me through your background.' })
})

Deno.test('extractInterviewTurn: blank feedback string normalizes to null', () => {
  const raw = JSON.stringify({ feedback: '   ', question: 'Walk me through your background.' })
  assertEquals(extractInterviewTurn(raw), { feedback: null, question: 'Walk me through your background.' })
})

Deno.test('extractInterviewTurn: returns null on garbage or missing input', () => {
  assertEquals(extractInterviewTurn('not json'), null)
  assertEquals(extractInterviewTurn(null), null)
  assertEquals(extractInterviewTurn(undefined), null)
  assertEquals(extractInterviewTurn('{"feedback": "ok"}'), null)
})

Deno.test('extractInterviewTurn: returns null when question is blank', () => {
  assertEquals(extractInterviewTurn(JSON.stringify({ feedback: null, question: '  ' })), null)
})
