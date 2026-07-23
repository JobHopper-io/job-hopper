import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { extractWhyFitBullets, formatSalaryRange, whyFitUserMessage } from '../why-fit-prompt.ts'

Deno.test('formatSalaryRange: both/min-only/max-only/neither', () => {
  assertEquals(formatSalaryRange(80000, 100000), '$80,000 - $100,000')
  assertEquals(formatSalaryRange(80000, null), '$80,000+')
  assertEquals(formatSalaryRange(null, 100000), 'Up to $100,000')
  assertEquals(formatSalaryRange(null, null), '')
})

Deno.test('whyFitUserMessage: fills blanks and includes job title', () => {
  const msg = whyFitUserMessage({
    currentJobTitle: null,
    targetJobTitle: null,
    yearsOfExperience: null,
    currentIndustry: null,
    targetRoleCategories: [],
    desiredSalaryMin: null,
    desiredSalaryMax: null,
    preferredLocations: [],
    openToRelocation: null,
    openToRemote: null,
    jobTitle: 'Welder',
    companyName: null,
    jobDescription: null,
    jobLocation: null,
    jobIsRemote: null,
    jobPayMin: null,
    jobPayMax: null,
    jobRoleCategory: null,
    matchScore: null,
  })
  assertEquals(msg.includes('Welder'), true)
  assertEquals(msg.includes('Open to remote:\nno'), true)
})

Deno.test('extractWhyFitBullets: parses fenced JSON and drops blanks', () => {
  const raw = '```json\n{"bullets": ["A good match.", "  ", "Another reason."]}\n```'
  assertEquals(extractWhyFitBullets(raw), ['A good match.', 'Another reason.'])
})

Deno.test('extractWhyFitBullets: returns [] on garbage or missing input', () => {
  assertEquals(extractWhyFitBullets('not json'), [])
  assertEquals(extractWhyFitBullets(null), [])
  assertEquals(extractWhyFitBullets(undefined), [])
  assertEquals(extractWhyFitBullets('{"nope": true}'), [])
})

Deno.test('extractWhyFitBullets: caps at maxBullets', () => {
  const raw = JSON.stringify({ bullets: ['a', 'b', 'c', 'd', 'e'] })
  assertEquals(extractWhyFitBullets(raw, 3), ['a', 'b', 'c'])
})
