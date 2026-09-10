import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { cyclePeriodAmountCents, normalizeBillingCycle } from '../billing-cycles.ts'

// Whole-period charge must equal what the Pricing page quotes:
//   Core  $29.99/mo -> quarterly $80.97, yearly $287.90
//   Prem  $49.99/mo -> quarterly $134.97, yearly $479.90
Deno.test('monthly is an unchanged pass-through', () => {
  assertEquals(cyclePeriodAmountCents(2999, 'monthly'), 2999)
  assertEquals(cyclePeriodAmountCents(4999, 'monthly'), 4999)
})

Deno.test('quarterly = 3 months, 10% off', () => {
  assertEquals(cyclePeriodAmountCents(2999, 'quarterly'), 8097)
  assertEquals(cyclePeriodAmountCents(4999, 'quarterly'), 13497)
})

Deno.test('yearly = 12 months, 20% off', () => {
  assertEquals(cyclePeriodAmountCents(2999, 'yearly'), 28790)
  assertEquals(cyclePeriodAmountCents(4999, 'yearly'), 47990)
})

Deno.test('normalizeBillingCycle falls back to monthly for junk', () => {
  assertEquals(normalizeBillingCycle(undefined), 'monthly')
  assertEquals(normalizeBillingCycle('weekly'), 'monthly')
  assertEquals(normalizeBillingCycle({}), 'monthly')
  assertEquals(normalizeBillingCycle('yearly'), 'yearly')
})
