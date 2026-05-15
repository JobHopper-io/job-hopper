import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { inferRoleCategoryFromJobText } from '../infer-role-category.ts'

Deno.test('inferRoleCategoryFromJobText picks engineering from title', () => {
  assertEquals(inferRoleCategoryFromJobText('Mechanical Engineer III', ''), 'engineering')
})

Deno.test('inferRoleCategoryFromJobText picks maintenance from description', () => {
  assertEquals(
    inferRoleCategoryFromJobText('Technician', 'Facilities maintenance and CMMS'),
    'maintenance',
  )
})
