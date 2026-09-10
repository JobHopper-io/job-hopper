/**
 * Billing cycles for base-plan / subscription-addon checkout.
 *
 * Discounts here MUST stay in sync with the frontend BILLING_CYCLES table in
 * src/lib/subscription.ts — code can't be shared across the Deno/Vite boundary, and the
 * server-computed charge has to match the price the Pricing page shows the user.
 */

export type BillingCycle = 'monthly' | 'quarterly' | 'yearly'

export const CYCLE_CONFIG: Record<
  BillingCycle,
  { interval: 'month' | 'year'; intervalCount: number; months: number; discountPct: number }
> = {
  monthly: { interval: 'month', intervalCount: 1, months: 1, discountPct: 0 },
  quarterly: { interval: 'month', intervalCount: 3, months: 3, discountPct: 10 },
  yearly: { interval: 'year', intervalCount: 1, months: 12, discountPct: 20 },
}

export function normalizeBillingCycle(value: unknown): BillingCycle {
  return typeof value === 'string' && value in CYCLE_CONFIG ? (value as BillingCycle) : 'monthly'
}

/**
 * Whole-period charge in cents for a monthly price and cycle. Rounds the same way the
 * frontend's `(monthly * months * (1 - pct/100)).toFixed(2)` display does, so the Stripe
 * charge equals the quoted price (e.g. Core yearly: 2999 -> 28790 = $287.90).
 */
export function cyclePeriodAmountCents(monthlyCents: number, cycle: BillingCycle): number {
  const cfg = CYCLE_CONFIG[cycle]
  return Math.round(monthlyCents * cfg.months * (1 - cfg.discountPct / 100))
}
