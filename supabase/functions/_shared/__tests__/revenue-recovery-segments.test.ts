import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  highMatchCountThreshold,
  isActivatedNeverPaid,
  isCancelled,
  isHeavyFreeUsage,
  isHighMatchUser,
  isNeverActivated,
  isNoLogin30d,
  isNonPayer,
  isVisaFocusedNoConversion,
  subscriptionFlagsFromStatuses,
} from '../revenue-recovery-segments.ts'

const NOW = new Date('2026-08-24T00:00:00Z').getTime()
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString()

const noSubs = subscriptionFlagsFromStatuses([])
const activeSubs = subscriptionFlagsFromStatuses(['active'])
const trialSubs = subscriptionFlagsFromStatuses(['trial'])
const canceledSubs = subscriptionFlagsFromStatuses(['canceled'])

Deno.test('isNonPayer: true only with no active/trial sub', () => {
  assertEquals(isNonPayer(noSubs), true)
  assertEquals(isNonPayer(canceledSubs), true)
  assertEquals(isNonPayer(activeSubs), false)
  assertEquals(isNonPayer(trialSubs), false)
})

Deno.test('isNeverActivated: onboarding incomplete, real auth user, past the 3-day grace window', () => {
  assertEquals(isNeverActivated({ onboardingCompleted: false, createdAt: daysAgo(5), hasAuthUser: true }, NOW), true)
  assertEquals(isNeverActivated({ onboardingCompleted: false, createdAt: daysAgo(1), hasAuthUser: true }, NOW), false, 'too fresh, inside the grace window')
  assertEquals(isNeverActivated({ onboardingCompleted: true, createdAt: daysAgo(5), hasAuthUser: true }, NOW), false, 'already activated')
  assertEquals(isNeverActivated({ onboardingCompleted: false, createdAt: daysAgo(5), hasAuthUser: false }, NOW), false, 'no real auth user (billing-only profile)')
})

Deno.test('isActivatedNeverPaid: onboarded with zero subscription rows ever', () => {
  assertEquals(isActivatedNeverPaid(true, noSubs), true)
  assertEquals(isActivatedNeverPaid(true, canceledSubs), false, 'has a subscription row -> cancelled segment, not this one')
  assertEquals(isActivatedNeverPaid(false, noSubs), false)
})

Deno.test('isCancelled matches the existing lifecycle report churned definition', () => {
  assertEquals(isCancelled(canceledSubs), true)
  assertEquals(isCancelled(activeSubs), false)
  assertEquals(isCancelled(subscriptionFlagsFromStatuses(['canceled', 'active'])), false, 'has another active sub -> not churned')
})

Deno.test('isNoLogin30d: non-payer, real last sign-in, past 30 days', () => {
  assertEquals(isNoLogin30d(daysAgo(45), NOW, noSubs), true)
  assertEquals(isNoLogin30d(daysAgo(10), NOW, noSubs), false, 'inside the window')
  assertEquals(isNoLogin30d(daysAgo(45), NOW, activeSubs), false, 'currently paying -> excluded, retention not revenue-recovery')
  assertEquals(isNoLogin30d(null, NOW, noSubs), false, 'no real sign-in on record is a data gap, not a signal')
})

Deno.test('isHeavyFreeUsage: hit the real freemium_settings cap, not an invented number', () => {
  assertEquals(isHeavyFreeUsage(3, 3, noSubs), true)
  assertEquals(isHeavyFreeUsage(2, 3, noSubs), false)
  assertEquals(isHeavyFreeUsage(3, 3, activeSubs), false, 'already paying')
})

Deno.test('highMatchCountThreshold: 80th percentile of the real distribution', () => {
  const counts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  assertEquals(highMatchCountThreshold(counts), 9)
  assertEquals(highMatchCountThreshold([]), Infinity, 'no matches anywhere -> nobody qualifies, not a guessed cutoff')
})

Deno.test('isHighMatchUser: non-payer at/above the real threshold', () => {
  assertEquals(isHighMatchUser(9, 9, noSubs), true)
  assertEquals(isHighMatchUser(8, 9, noSubs), false)
  assertEquals(isHighMatchUser(9, 9, activeSubs), false)
  assertEquals(isHighMatchUser(0, 0, noSubs), false, 'zero matches never qualifies even if threshold is 0')
})

Deno.test('isVisaFocusedNoConversion: real requires_us_sponsorship=true, non-payer', () => {
  assertEquals(isVisaFocusedNoConversion(true, noSubs), true)
  assertEquals(isVisaFocusedNoConversion(false, noSubs), false)
  assertEquals(isVisaFocusedNoConversion(null, noSubs), false, 'unanswered onboarding question is not a signal either way')
  assertEquals(isVisaFocusedNoConversion(true, activeSubs), false, 'already converted')
})
