import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildSegmentCopy, type RecoveryStage, recoveryCampaign, recoveryLink } from '../revenue-recovery-copy.ts'
import { RECOVERY_SEGMENT_PRIORITY } from '../revenue-recovery-segments.ts'

const ctxFor = (campaign: string, over = {}) => ({
  firstName: 'Ann Lee',
  siteUrl: 'https://job-hopper.io',
  campaign,
  searchesUsed: 3,
  searchLimit: 3,
  hasResume: false,
  targetJobTitle: 'Data Analyst',
  ...over,
})

const all = () =>
  RECOVERY_SEGMENT_PRIORITY.flatMap((segment) =>
    ([1, 2] as RecoveryStage[]).map((stage) => ({ segment, stage, copy: buildSegmentCopy(segment, stage, ctxFor(recoveryCampaign(segment, stage))) }))
  )

// The job feed has been stale since 2026-11-12: nothing may suggest new or fresh jobs.
const FRESH_JOBS = /\b(new|fresh|latest|recent|just[- ]posted)\b[^.]{0,30}\b(jobs?|postings?|matches|roles|openings)\b|\bcome in regularly\b|\bpiling up\b/i
const JOB_COUNTS = /\b\d+\s+(new\s+)?(jobs?|matches|postings?|roles|openings)\b/i

Deno.test('copy exists for every segment and both stages', () => {
  assertEquals(all().length, RECOVERY_SEGMENT_PRIORITY.length * 2)
  for (const { segment, stage, copy } of all()) assert(copy.subject && copy.body.includes('Hi Ann,'), `${segment} s${stage}`)
})

Deno.test('no fresh-jobs claims and no job counts in any subject or body', () => {
  for (const { segment, stage, copy } of all()) {
    for (const text of [copy.subject, copy.body]) {
      assertEquals(FRESH_JOBS.test(text), false, `${segment} s${stage}: ${text.match(FRESH_JOBS)?.[0]}`)
      assertEquals(JOB_COUNTS.test(text), false, `${segment} s${stage}: ${text.match(JOB_COUNTS)?.[0]}`)
    }
  }
})

Deno.test('the regex catches the old no_login copy', () => {
  assert(FRESH_JOBS.test('New job postings come in regularly, so it is worth another look.'))
  assert(FRESH_JOBS.test('Your job matches are piling up on the free plan'))
})

Deno.test('no discount or offer language unless an offer is configured', () => {
  const OFFER = /\b(discount|% off|percent off|coupon|promo|free month|offer|deal)\b/i
  for (const { segment, stage, copy } of all()) assertEquals(OFFER.test(copy.body + copy.subject), false, `${segment} s${stage}`)
  const withOffer = buildSegmentCopy('cancelled', 1, ctxFor('recovery_cancelled_s1', { offer: 'Use code BACK20 for 20% off your first month.' }))
  assert(withOffer.body.includes('Use code BACK20 for 20% off your first month.'))
})

Deno.test('every link carries the recovery UTM tags for its campaign', () => {
  for (const { segment, stage, copy } of all()) {
    const links = copy.body.match(/https:\/\/\S+/g) ?? []
    assert(links.length > 0, `${segment} s${stage} has a link`)
    for (const link of links) {
      const p = new URL(link).searchParams
      assertEquals([p.get('utm_source'), p.get('utm_medium'), p.get('utm_campaign')], ['email_recovery', 'email', `recovery_${segment}_s${stage}`])
    }
  }
})

Deno.test('personalization: searches used vs limit, target title, missing name', () => {
  const heavy = buildSegmentCopy('heavy_free_usage', 1, ctxFor('c', { searchesUsed: 3, searchLimit: 3 }))
  assert(heavy.body.includes("You've used 3 of the 3 searches"))
  const noLimit = buildSegmentCopy('heavy_free_usage', 1, ctxFor('c', { searchesUsed: undefined, searchLimit: undefined }))
  assert(noLimit.body.includes("You've used all the searches"))
  assert(buildSegmentCopy('activated_never_paid', 2, ctxFor('c')).body.includes('your Data Analyst search'))
  assertEquals(buildSegmentCopy('activated_never_paid', 2, ctxFor('c', { targetJobTitle: null })).body.includes('undefined'), false)
  assert(buildSegmentCopy('cancelled', 1, ctxFor('c', { firstName: null })).body.startsWith('Hi there,'))
})

Deno.test('recoveryLink keeps the path and sets the UTM params', () => {
  assertEquals(recoveryLink('https://job-hopper.io', '/pricing', 'recovery_cancelled_s1'),
    'https://job-hopper.io/pricing?utm_source=email_recovery&utm_medium=email&utm_campaign=recovery_cancelled_s1')
})
