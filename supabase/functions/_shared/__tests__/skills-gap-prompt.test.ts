import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { extractSkillsGap, skillsGapUserMessage } from '../skills-gap-prompt.ts'

Deno.test('skillsGapUserMessage: includes job title and resume text', () => {
  const msg = skillsGapUserMessage({
    jobTitle: 'Welder',
    companyName: null,
    jobDescription: null,
    resumeText: 'Experienced fabricator with MIG/TIG welding certification.',
  })
  assertEquals(msg.includes('Welder'), true)
  assertEquals(msg.includes('MIG/TIG welding certification'), true)
})

Deno.test('extractSkillsGap: parses fenced JSON', () => {
  const raw =
    '```json\n{"matchingSkills": ["SQL"], "missingSkills": ["Kubernetes"], "learningTopics": ["Kubernetes basics"]}\n```'
  assertEquals(extractSkillsGap(raw), {
    matchingSkills: ['SQL'],
    missingSkills: ['Kubernetes'],
    learningTopics: ['Kubernetes basics'],
  })
})

Deno.test('extractSkillsGap: parses unfenced JSON with empty gap arrays', () => {
  const raw = JSON.stringify({ matchingSkills: ['SQL', 'Python'], missingSkills: [], learningTopics: [] })
  assertEquals(extractSkillsGap(raw), {
    matchingSkills: ['SQL', 'Python'],
    missingSkills: [],
    learningTopics: [],
  })
})

Deno.test('extractSkillsGap: trims strings and drops blank entries', () => {
  const raw = JSON.stringify({
    matchingSkills: [' SQL ', '', '  '],
    missingSkills: ['Kubernetes'],
    learningTopics: ['Kubernetes basics'],
  })
  assertEquals(extractSkillsGap(raw)?.matchingSkills, ['SQL'])
})

Deno.test('extractSkillsGap: returns null on garbage or missing input', () => {
  assertEquals(extractSkillsGap('not json'), null)
  assertEquals(extractSkillsGap(null), null)
  assertEquals(extractSkillsGap(undefined), null)
})

Deno.test('extractSkillsGap: returns null when a required field is missing or wrong type', () => {
  assertEquals(extractSkillsGap(JSON.stringify({ matchingSkills: [], missingSkills: [] })), null)
  assertEquals(
    extractSkillsGap(JSON.stringify({ matchingSkills: 'SQL', missingSkills: [], learningTopics: [] })),
    null,
  )
})
