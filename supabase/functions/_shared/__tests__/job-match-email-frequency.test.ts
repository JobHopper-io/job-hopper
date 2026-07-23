import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { clampJobMatchFrequency } from '../job-match-email-frequency.ts'

Deno.test('clampJobMatchFrequency: allowed frequency passes through unchanged', () => {
  assertEquals(clampJobMatchFrequency('weekly', 'free'), 'weekly')
  assertEquals(clampJobMatchFrequency('daily', 'core'), 'daily')
  assertEquals(clampJobMatchFrequency('immediate', 'premium'), 'immediate')
})

Deno.test('clampJobMatchFrequency: disallowed frequency falls back to the tier max', () => {
  assertEquals(clampJobMatchFrequency('immediate', 'free'), 'weekly')
  assertEquals(clampJobMatchFrequency('daily', 'free'), 'weekly')
  assertEquals(clampJobMatchFrequency('immediate', 'core'), 'daily')
})
