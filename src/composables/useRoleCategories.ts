/**
 * Target role categories: single source (label + value). Value is stored in DB.
 */

export const ROLE_CATEGORIES = [
  { label: 'Operations / Production', value: 'operations' },
  { label: 'Maintenance / Technical', value: 'maintenance' },
  { label: 'Engineering', value: 'engineering' },
  { label: 'Supervisory / Management', value: 'management' },
  { label: 'Director / VP / Executive', value: 'executive' },
  { label: 'Other', value: 'other' }
] as const

export type RoleCategoryValue = (typeof ROLE_CATEGORIES)[number]['value']

const valueToLabel = Object.fromEntries(ROLE_CATEGORIES.map((r) => [r.value, r.label]))

export function getRoleCategoryLabel(value: string): string {
  return valueToLabel[value] ?? value
}

export function useRoleCategories() {
  return {
    roleCategories: ROLE_CATEGORIES,
    getRoleCategoryLabel
  }
}
