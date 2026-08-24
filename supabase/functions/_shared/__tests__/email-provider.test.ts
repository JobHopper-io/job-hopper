import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseFromAddress } from '../email-provider.ts'

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
