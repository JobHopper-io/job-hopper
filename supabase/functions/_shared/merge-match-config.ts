import { defaultConfig, mergeConfig, type MatchConfig } from './job-matching-algorithm.ts'

/** Merges DB partial config with request overrides into a full {@link MatchConfig}. */
export function mergeConfigOverrides(
  base: Partial<MatchConfig> | null | undefined,
  override: Partial<MatchConfig> | null | undefined,
): MatchConfig | undefined {
  if (!base && !override) return undefined
  return mergeConfig({
    ...(base ?? {}),
    ...(override ?? {}),
  })
}

export function overrideToFullConfig(
  input: Partial<MatchConfig> | null | undefined,
): MatchConfig {
  return mergeConfig(input ?? defaultConfig)
}

const SUM_TOLERANCE = 0.02

export function validateMatchConfig(config: MatchConfig): string | null {
  const cw = config.categoryWeights
  const catSum =
    cw.phrase + cw.pay + cw.location + cw.recency + cw.filterMatches
  if (Math.abs(catSum - 1) > SUM_TOLERANCE) {
    return `Category weights must sum to 1.0 (got ${catSum.toFixed(3)})`
  }

  const sw = config.phrase.surfaceWeights
  const surfSum = sw.title + sw.description + sw.briefing
  if (Math.abs(surfSum - 1) > SUM_TOLERANCE) {
    return `Phrase surface weights must sum to 1.0 (got ${surfSum.toFixed(3)})`
  }

  if (config.thresholds.minTotalScore < 0 || config.thresholds.minTotalScore > 100) {
    return 'minTotalScore must be between 0 and 100'
  }

  return null
}
