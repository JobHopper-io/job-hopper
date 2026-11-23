import type { RecoveryCandidate } from '../revenue-recovery-segments.ts'

export const NOW = new Date('2026-11-24T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

/** A candidate in no segment; override fields per test. */
export function candidate(over: Partial<RecoveryCandidate> = {}): RecoveryCandidate {
  return {
    profile_id: 'p1',
    email: 'ann@example.com',
    first_name: 'Ann',
    target_job_title: null,
    created_at: daysAgo(1),
    email_confirmed: true,
    onboarding_completed: true,
    has_resume: true,
    requires_us_sponsorship: false,
    last_seen_at: daysAgo(1),
    has_any_sub: true,
    has_canceled_sub: false,
    job_searches_used: 0,
    max_job_searches: 3,
    abandoned_checkout_at: null,
    abandoned_checkout_proxy: false,
    ...over,
  }
}

