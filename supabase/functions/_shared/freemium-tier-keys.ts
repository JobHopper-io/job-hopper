/** Base plan `products.key` values allowed for freemium tier selection and overrides. */
export const FREEMIUM_BASE_PLAN_TIER_KEYS = [
  'entry_mid',
  'senior_management',
  'director_vp_c_level',
] as const

export type FreemiumBasePlanTierKey = (typeof FREEMIUM_BASE_PLAN_TIER_KEYS)[number]

export function isFreemiumBasePlanTierKey(value: string): value is FreemiumBasePlanTierKey {
  return (FREEMIUM_BASE_PLAN_TIER_KEYS as readonly string[]).includes(value)
}
