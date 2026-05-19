import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildCompanyCacheKey,
  employerNamePlausible,
  hiringTitlePhrases,
  locationRegionToken,
  normalizeCompanyName,
  pickBestPerson,
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

Deno.test('scoreOrganizationCandidates returns null when empty', () => {
  const r = scoreOrganizationCandidates('Acme', null, [])
  assertEquals(r.best, null)
  assertEquals(r.ambiguous, false)
})

Deno.test('scoreOrganizationCandidates picks clear winner', () => {
  const orgs = [
    { id: '1', name: 'Other Co', primary_domain: 'other.com' },
    { id: '2', name: 'Acme Corp', primary_domain: 'acme.com' },
  ]
  const r = scoreOrganizationCandidates('Acme Corp', 'Texas', orgs)
  assertEquals(r.ambiguous, false)
  assertEquals(r.best?.organizationId, '2')
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

Deno.test('employerNamePlausible uses fuzzy name', () => {
  assertEquals(employerNamePlausible('Acme Corporation', 'Acme Corp'), true)
  assertEquals(employerNamePlausible('Acme Corporation', 'Totally Different LLC'), false)
})
