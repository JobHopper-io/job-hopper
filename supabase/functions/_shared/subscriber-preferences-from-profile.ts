import type { Tables } from './database.ts'
import type { SubscriberPreferences } from './job-matching-algorithm.ts'

/** Profile columns required to build `SubscriberPreferences`. */
export type ProfileMatchingFields = Pick<
  Tables<'profiles'>,
  | 'target_job_title'
  | 'current_job_title'
  | 'current_industry'
  | 'target_role_categories'
  | 'desired_salary_min'
  | 'desired_salary_max'
  | 'preferred_locations'
  | 'open_to_relocation'
  | 'open_to_remote'
  | 'location_radius_miles'
>

export function subscriberPreferencesFromProfile(
  profile: ProfileMatchingFields,
  subscriptionTierProductKeys: string[],
): SubscriberPreferences {
  return {
    subscriptionTierProductKeys,
    roles: profile.target_role_categories ?? [],
    targetJobTitle: profile.target_job_title,
    currentJobTitle: profile.current_job_title,
    currentIndustry: profile.current_industry,
    payRangeMin: profile.desired_salary_min,
    payRangeMax: profile.desired_salary_max,
    preferredLocations: profile.preferred_locations ?? [],
    openToRelocation: profile.open_to_relocation,
    openToRemote: profile.open_to_remote,
    locationRadiusMiles: profile.location_radius_miles ?? null,
  }
}
