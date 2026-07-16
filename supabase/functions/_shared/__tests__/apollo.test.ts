import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildCompanyCacheKey,
  employerNamePlausible,
  hiringTitlePhrases,
  locationRegionToken,
  normalizeCompanyName,
  pickBestPerson,
  pickTopPeople,
  scoreOrganizationCandidates,
} from '../apollo.ts'

Deno.test('normalizeCompanyName strips suffix and lowercases', () => {
  assertEquals(normalizeCompanyName('Acme Manufacturing, LLC'), 'acme manufacturing')
})

Deno.test('buildCompanyCacheKey includes region when present', () => {
  assertEquals(buildCompanyCacheKey('Acme', 'Austin, TX'), 'acme|tx')
})

Deno.test('locationRegionToken takes last segment', () => {
  assertEquals(locationRegionToken('Remote, USA'), 'usa')
})

Deno.test('scoreOrganizationCandidates returns no_candidates when empty', () => {
  const r = scoreOrganizationCandidates('Acme', null, [])
  assertEquals(r.kind, 'no_candidates')
})

Deno.test('scoreOrganizationCandidates picks clear winner', () => {
  const orgs = [
    { id: '1', name: 'Other Co', primary_domain: 'other.com' },
    { id: '2', name: 'Acme Corp', primary_domain: 'acme.com' },
  ]
  const r = scoreOrganizationCandidates('Acme Corp', 'Texas', orgs)
  assertEquals(r.kind, 'picked')
  if (r.kind === 'picked') {
    assertEquals(r.best.organizationId, '2')
  }
})

Deno.test('scoreOrganizationCandidates picks when top is one point above second', () => {
  const orgs = [
    { id: 'w', name: 'WidgetCo', primary_domain: 'widget.com' },
    { id: 'o', name: 'Other Retail Inc', primary_domain: 'other.com' },
  ]
  const r = scoreOrganizationCandidates('WidgetCo', 'Austin, TX', orgs)
  assertEquals(r.kind, 'picked')
  if (r.kind === 'picked') {
    assertEquals(r.best.organizationId, 'w')
  }
})

Deno.test('scoreOrganizationCandidates needs_user_choice when second is within ambiguity ratio of top', () => {
  const orgs = [
    { id: '1', name: 'WidgetCo A', primary_domain: 'a.com' },
    { id: '2', name: 'WidgetCo B', primary_domain: 'b.com' },
  ]
  const r = scoreOrganizationCandidates('WidgetCo', 'Austin, TX', orgs)
  assertEquals(r.kind, 'needs_user_choice')
  if (r.kind === 'needs_user_choice') {
    assertEquals(r.candidates.length, 2)
    assertEquals(r.candidates[0].score, r.candidates[1].score)
  }
})

Deno.test('scoreOrganizationCandidates needs_user_choice includes every org above ambiguity floor', () => {
  const orgs = [
    { id: '1', name: 'WidgetCo A', primary_domain: 'a.com' },
    { id: '2', name: 'WidgetCo B', primary_domain: 'b.com' },
    { id: '3', name: 'WidgetCo C', primary_domain: 'c.com' },
  ]
  const r = scoreOrganizationCandidates('WidgetCo', 'Austin, TX', orgs)
  assertEquals(r.kind, 'needs_user_choice')
  if (r.kind === 'needs_user_choice') {
    assertEquals(r.candidates.length, 3)
  }
})

Deno.test('pickBestPerson prefers has_email and title match', () => {
  const phrases = hiringTitlePhrases('engineering', 'Software Engineer')
  const people = [
    { id: 'a', title: 'Sales Manager', has_email: true },
    { id: 'b', title: 'Engineering Manager', has_email: true },
    { id: 'c', title: 'Engineering Manager', has_email: false },
  ]
  const best = pickBestPerson(people, phrases)
  assertEquals(best?.id, 'b')
})

Deno.test('pickTopPeople returns up to count, email-reachable first, deduped', () => {
  const phrases = hiringTitlePhrases('engineering', 'Software Engineer')
  const people = [
    { id: 'a', title: 'Recruiter', has_email: false },
    { id: 'b', title: 'Engineering Manager', has_email: true },
    { id: 'b', title: 'Engineering Manager', has_email: true }, // duplicate id
    { id: 'c', title: 'Talent Acquisition', has_email: true },
  ]
  const top = pickTopPeople(people, phrases, 2)
  assertEquals(top.map((p) => p.id), ['b', 'c']) // has_email first, dupe dropped
  assertEquals(pickTopPeople(people, phrases, 0).length, 0)
})

Deno.test('pickTopPeople prioritizes seniority for Premium (hiring manager over recruiter)', () => {
  const phrases = hiringTitlePhrases('engineering', 'Software Engineer')
  const people = [
    { id: 'rec', title: 'Technical Recruiter', has_email: true },
    { id: 'vp', title: 'VP of Engineering', has_email: true },
    { id: 'dir', title: 'Director of Engineering', has_email: true },
  ]
  const premium = pickTopPeople(people, phrases, 1, { prioritizeSeniority: true })
  assertEquals(premium[0]?.id, 'vp') // most senior decision-maker surfaces first
  const ordered = pickTopPeople(people, phrases, 3, { prioritizeSeniority: true })
  assertEquals(ordered.map((p) => p.id), ['vp', 'dir', 'rec'])
})

Deno.test('employerNamePlausible uses fuzzy name', () => {
  assertEquals(employerNamePlausible('Acme Corporation', 'Acme Corp'), true)
  assertEquals(employerNamePlausible('Acme Corporation', 'Totally Different LLC'), false)
})
