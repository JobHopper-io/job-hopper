import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  categorizeUserLifecycle,
  subscriptionFlagsFromStatuses,
} from '../user-lifecycle-category.ts'

Deno.test('incomplete onboarding when not completed', () => {
  const flags = subscriptionFlagsFromStatuses([], false)
  assertEquals(categorizeUserLifecycle(flags), 'incomplete_onboarding')
})

Deno.test('stripe trial before active', () => {
  const flags = subscriptionFlagsFromStatuses(['trial', 'active'], true)
  assertEquals(categorizeUserLifecycle(flags), 'stripe_free_trial')
})

Deno.test('active subscription without trial', () => {
  const flags = subscriptionFlagsFromStatuses(['active'], true)
  assertEquals(categorizeUserLifecycle(flags), 'active_subscription')
})

Deno.test('churned when only canceled', () => {
  const flags = subscriptionFlagsFromStatuses(['canceled'], true)
  assertEquals(categorizeUserLifecycle(flags), 'churned')
})

Deno.test('freemium when onboarded with no subscriptions', () => {
  const flags = subscriptionFlagsFromStatuses([], true)
  assertEquals(categorizeUserLifecycle(flags), 'freemium')
})
