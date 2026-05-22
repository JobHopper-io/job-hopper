import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  computeFilterMatchesQuality,
  computeRoleCategoryMatchQuality,
} from '../filter-matching.ts'

Deno.test('computeRoleCategoryMatchQuality: no target roles is neutral', () => {
  assertEquals(computeRoleCategoryMatchQuality([], 'Engineering'), 1)
  assertEquals(computeRoleCategoryMatchQuality([], null), 1)
})

Deno.test('computeRoleCategoryMatchQuality: match is case-insensitive', () => {
  assertEquals(computeRoleCategoryMatchQuality(['Engineering'], 'engineering'), 1)
  assertEquals(computeRoleCategoryMatchQuality(['Sales'], 'Engineering'), 0)
})

Deno.test('computeRoleCategoryMatchQuality: missing job category scores 0', () => {
  assertEquals(computeRoleCategoryMatchQuality(['Engineering'], null), 0)
})

Deno.test('computeFilterMatchesQuality delegates to role category', () => {
  assertEquals(computeFilterMatchesQuality(['Data'], 'Data'), 1)
  assertEquals(computeFilterMatchesQuality(['Data'], 'Marketing'), 0)
})
