// Reverse recruiting (growth day 3): run the existing job matcher for a prospect who has no
// profile. The prospect's extracted fields are adapted into SubscriberPreferences and fed to
// the unchanged matchJobs with the live matching_algorithm_config, so a prospect is scored
// exactly the way a signed-up user with the same fields would be. Pure (no DB access):
// callers load the jobs, the active config and the synonyms.
import {
  type JobRecord,
  type MatchConfig,
  type RankedJob,
  type SubscriberPreferences,
  matchJobs,
  mergeConfig,
} from './job-matching-algorithm.ts'
import type { MatchSynonymEntry } from './match-synonym-row.ts'

/** The prospects columns the matcher reads (see migrations 20261121130000 / 20261122120000). */
export interface ProspectMatchingFields {
  id: string
  target_job_title: string | null
  target_role_categories: string[] | null
  preferred_locations: string[] | null
  open_to_remote: boolean | null
  career_level: string | null
}

export const PROSPECT_MATCHING_SELECT =
  'id, target_job_title, target_role_categories, preferred_locations, open_to_remote, career_level'

export const DEFAULT_CANDIDATE_LIMIT = 10

export type ProspectPreferencesResult =
  | { ok: true; careerLevel: string; prefs: SubscriberPreferences }
  | { ok: false; reason: 'no_level' }

/**
 * Prospect -> SubscriberPreferences. Prospects have no current title, industry, salary,
 * relocation or radius, so those stay null (same as a profile that left them blank).
 * career_level is the matching tier, exactly as profiles.career_level is for users.
 */
export function prospectToPreferences(prospect: ProspectMatchingFields): ProspectPreferencesResult {
  const careerLevel = prospect.career_level?.trim()
  if (!careerLevel) return { ok: false, reason: 'no_level' }
  return {
    ok: true,
    careerLevel,
    prefs: {
      subscriptionTierProductKeys: [careerLevel],
      roles: prospect.target_role_categories ?? [],
      targetJobTitle: prospect.target_job_title,
      currentJobTitle: null,
      currentIndustry: null,
      payRangeMin: null,
      payRangeMax: null,
      preferredLocations: prospect.preferred_locations ?? [],
      openToRelocation: null,
      openToRemote: prospect.open_to_remote,
      locationRadiusMiles: null,
    },
  }
}

/** Live config (active matching_algorithm_config row merged over defaults) plus synonyms. */
export interface MatchingContext {
  config: Partial<MatchConfig>
  synonyms: MatchSynonymEntry[]
  /** The live recency.maxAgeDays: the default window. */
  liveMaxAgeDays: number
}

/** Build the context from the active config override (already merged) and synonyms. */
export function matchingContext(config: Partial<MatchConfig> | null | undefined, synonyms: MatchSynonymEntry[]): MatchingContext {
  const c = config ?? {}
  return { config: c, synonyms, liveMaxAgeDays: mergeConfig(c).recency.maxAgeDays }
}

/** The live config with only the recency window replaced. */
export function configForWindow(ctx: MatchingContext, windowDays?: number): Partial<MatchConfig> {
  const maxAgeDays = windowDays ?? ctx.liveMaxAgeDays
  return { ...ctx.config, recency: { ...mergeConfig(ctx.config).recency, maxAgeDays } }
}

export type ProspectMatchResult =
  | { status: 'matched'; prospectId: string; careerLevel: string; totalMatched: number; candidates: RankedJob[] }
  | { status: 'skipped'; prospectId: string; reason: 'no_level' }

/**
 * Top `limit` jobs for a prospect, best first. Pure: the caller supplies the jobs (already
 * loaded for the prospect's level) and the matching context. The default limit leaves room
 * for vacancy verification to drop closed or unverifiable jobs.
 */
export function matchJobsForProspect(
  prospect: ProspectMatchingFields,
  jobs: JobRecord[],
  ctx: MatchingContext,
  options: { windowDays?: number; limit?: number } = {},
): ProspectMatchResult {
  const adapted = prospectToPreferences(prospect)
  if (!adapted.ok) return { status: 'skipped', prospectId: prospect.id, reason: adapted.reason }
  const ranked = matchJobs(adapted.prefs, jobs, configForWindow(ctx, options.windowDays), {
    synonyms: ctx.synonyms,
  })
  return {
    status: 'matched',
    prospectId: prospect.id,
    careerLevel: adapted.careerLevel,
    totalMatched: ranked.length,
    candidates: ranked.slice(0, options.limit ?? DEFAULT_CANDIDATE_LIMIT),
  }
}
