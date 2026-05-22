/** Role category match quality in [0, 1]. Neutral (1) when subscriber has no target roles. */
export function computeRoleCategoryMatchQuality(
  targetRoles: string[],
  jobRoleCategory: string | null,
): number {
  if (targetRoles.length === 0) return 1
  if (!jobRoleCategory) return 0
  const lowerCategory = jobRoleCategory.toLowerCase()
  return targetRoles.some((role) => role.toLowerCase() === lowerCategory) ? 1 : 0
}

/**
 * Filter Matches category quality (0–1). Extensible: add more subscriber filters here later.
 */
export function computeFilterMatchesQuality(
  targetRoles: string[],
  jobRoleCategory: string | null,
): number {
  return computeRoleCategoryMatchQuality(targetRoles, jobRoleCategory)
}
