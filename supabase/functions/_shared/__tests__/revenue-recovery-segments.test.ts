import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  assignSegment,
  highMatchCountThreshold,
  isHighMatchUser,
  matchingSegments,
  RECOVERY_SEGMENT_PRIORITY,
} from '../revenue-recovery-segments.ts'
import { candidate, NOW as NOW_DATE } from './recovery-fixtures.ts'

const NOW = NOW_DATE.getTime()
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

Deno.test('baseline fixture is in no segment', () => {
  assertEquals(matchingSegments(candidate(), NOW), [])
  assertEquals(assignSegment(candidate(), NOW), null)
})

Deno.test('each segment rule', () => {
  const cases: [Partial<Parameters<typeof candidate>[0]>, string][] = [
    [{ abandoned_checkout_at: daysAgo(1) }, 'abandoned_checkout'],
    [{ abandoned_checkout_proxy: true }, 'abandoned_checkout'],
    [{ has_canceled_sub: true }, 'cancelled'],
    [{ job_searches_used: 3 }, 'heavy_free_usage'],
    [{ requires_us_sponsorship: true }, 'visa_focused_no_conversion'],
    [{ has_any_sub: false }, 'activated_never_paid'],
    [{ has_resume: false }, 'onboarded_no_resume'],
    [{ onboarding_completed: false, created_at: daysAgo(3), has_resume: true }, 'never_activated'],
    [{ last_seen_at: daysAgo(30) }, 'no_login_30d'],
  ]
  for (const [over, expected] of cases) assertEquals(assignSegment(candidate(over), NOW), expected, JSON.stringify(over))
})

Deno.test('edges: under the search cap, signup under 3 days, never seen, sponsorship unknown', () => {
  assertEquals(assignSegment(candidate({ job_searches_used: 2 }), NOW), null)
  assertEquals(assignSegment(candidate({ onboarding_completed: false, created_at: daysAgo(2) }), NOW), null)
  assertEquals(assignSegment(candidate({ last_seen_at: null }), NOW), null)
  assertEquals(assignSegment(candidate({ last_seen_at: daysAgo(29) }), NOW), null)
  assertEquals(assignSegment(candidate({ requires_us_sponsorship: null }), NOW), null)
})

Deno.test('priority: someone in every segment gets abandoned_checkout; then each next one down', () => {
  const all: Parameters<typeof candidate>[0] = {
    abandoned_checkout_at: daysAgo(1), has_canceled_sub: true, job_searches_used: 5, requires_us_sponsorship: true,
    has_any_sub: false, has_resume: false, last_seen_at: daysAgo(40),
  }
  assertEquals(matchingSegments(candidate(all), NOW), [
    'abandoned_checkout', 'cancelled', 'heavy_free_usage', 'visa_focused_no_conversion',
    'activated_never_paid', 'onboarded_no_resume', 'no_login_30d',
  ])
  assertEquals(assignSegment(candidate(all), NOW), 'abandoned_checkout')
  assertEquals(assignSegment(candidate({ ...all, abandoned_checkout_at: null }), NOW), 'cancelled')
  assertEquals(assignSegment(candidate({ ...all, abandoned_checkout_at: null, has_canceled_sub: false }), NOW), 'heavy_free_usage')
  assertEquals(assignSegment(candidate({ has_resume: false, last_seen_at: daysAgo(40) }), NOW), 'onboarded_no_resume')
  // never_activated outranks no_login_30d
  assertEquals(assignSegment(candidate({ onboarding_completed: false, created_at: daysAgo(40), last_seen_at: daysAgo(40) }), NOW), 'never_activated')
})

Deno.test('priority order is exactly as specified; high_match_users is not active', () => {
  assertEquals([...RECOVERY_SEGMENT_PRIORITY], [
    'abandoned_checkout', 'cancelled', 'heavy_free_usage', 'visa_focused_no_conversion',
    'activated_never_paid', 'onboarded_no_resume', 'never_activated', 'no_login_30d',
  ])
  assertEquals((RECOVERY_SEGMENT_PRIORITY as readonly string[]).includes('high_match_users'), false)
})

Deno.test('high-match helpers kept for re-enabling', () => {
  assertEquals(highMatchCountThreshold([1, 2, 3, 4, 5]), 5)
  assertEquals(isHighMatchUser(5, 5), true)
  assertEquals(isHighMatchUser(0, 0), false)
})
