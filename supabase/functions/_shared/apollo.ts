/**
 * Apollo.io REST helpers for Premium Insights (org resolve → people search → match).
 * Paid steps: mixed_companies/search (1), people/match (1). mixed_people/api_search is free.
 */

const APOLLO_BASE = 'https://api.apollo.io/api/v1'

export type ApolloOrgCandidate = {
  id: string
  name: string
  primary_domain: string | null
  primary_phone?: { sanitized_number?: string } | null
}

export type ApolloPersonSearchHit = {
  id: string
  first_name?: string | null
  last_name_obfuscated?: string | null
  title?: string | null
  has_email?: boolean
  organization?: { name?: string | null } | null
}

export type MatchedContact = {
  apolloPersonId: string
  name: string
  title: string | null
  email: string | null
  location: string | null
  note: string | null
}

export type ResolvedOrganization = {
  organizationId: string
  name: string
  primaryDomain: string | null
}

/** Stored on job_hiring_contacts and returned to the client when top org scores tie. */
export type OrgDisambiguationCandidate = {
  apollo_organization_id: string
  name: string
  primary_domain: string | null
  score: number
}

export type OrgScoreResult =
  | { kind: 'picked'; best: ResolvedOrganization }
  | { kind: 'below_threshold' }
  | { kind: 'no_candidates' }
  | { kind: 'needs_user_choice'; candidates: OrgDisambiguationCandidate[] }

function stripLegalSuffixes(name: string): string {
  return name
    .replace(/\b(inc|llc|l\.l\.c\.|corp|corporation|ltd|limited|plc|co|company)\b\.?/gi, '')
    .replace(/[,.\s]+/g, ' ')
    .trim()
}

/** Normalize company name for cache keys and search. */
export function normalizeCompanyName(name: string): string {
  return stripLegalSuffixes(name).toLowerCase().replace(/\s+/g, ' ')
}

/** Coarse location token for cache key (optional). */
export function locationRegionToken(location: string | null | undefined): string {
  if (!location || typeof location !== 'string') return ''
  const t = location.trim().toLowerCase()
  const parts = t.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] ?? '' : ''
}

export function buildCompanyCacheKey(companyName: string, location: string | null | undefined): string {
  const n = normalizeCompanyName(companyName)
  const r = locationRegionToken(location)
  return r ? `${n}|${r}` : n
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1),
  )
}

function nameScore(companyName: string, orgName: string): number {
  const a = normalizeCompanyName(companyName)
  const b = normalizeCompanyName(orgName)
  if (a === b) return 100
  if (b.includes(a) || a.includes(b)) return 85
  const ta = tokenSet(a)
  const tb = tokenSet(b)
  let overlap = 0
  for (const x of ta) {
    if (tb.has(x)) overlap++
  }
  if (overlap === 0) return 0
  return Math.min(70, 20 + overlap * 12)
}

function locationScore(jobLocation: string | null | undefined, org: ApolloOrgCandidate): number {
  if (!jobLocation?.trim()) return 5
  const jl = jobLocation.toLowerCase()
  const phone = org.primary_phone?.sanitized_number ?? ''
  if (phone && jl) return 8
  return 5
}

const MIN_ORG_SCORE = 25
/** Second place must be strictly above this fraction of the top score to trigger user disambiguation (same rule as historical Apollo org scoring). */
const AMBIGUITY_RATIO = 0.92

export function scoreOrganizationCandidates(
  companyName: string,
  jobLocation: string | null | undefined,
  orgs: ApolloOrgCandidate[],
): OrgScoreResult {
  if (!orgs.length) {
    console.log(
      JSON.stringify({
        fn: 'apollo:org-score',
        outcome: 'no_candidates',
        companyName,
        jobLocation: jobLocation ?? null,
        orgCount: 0,
      }),
    )
    return { kind: 'no_candidates' }
  }
  const scored = orgs.map((o) => ({
    org: o,
    score: nameScore(companyName, o.name) + locationScore(jobLocation, o),
  }))
  scored.sort((a, b) => b.score - a.score)
  const top = scored[0]
  const second = scored[1]
  const rankings = scored.slice(0, 5).map((row) => ({
    id: row.org.id,
    name: row.org.name,
    score: row.score,
    nameScore: nameScore(companyName, row.org.name),
    locationScore: locationScore(jobLocation, row.org),
  }))
  if (!top || top.score < MIN_ORG_SCORE) {
    console.log(
      JSON.stringify({
        fn: 'apollo:org-score',
        outcome: 'below_threshold',
        companyName,
        jobLocation: jobLocation ?? null,
        minScore: MIN_ORG_SCORE,
        topScore: top?.score ?? null,
        rankings,
      }),
    )
    return { kind: 'below_threshold' }
  }

  const ambiguityFloor = top.score * AMBIGUITY_RATIO

  if (!second || second.score <= ambiguityFloor) {
    console.log(
      JSON.stringify({
        fn: 'apollo:org-score',
        outcome: 'picked',
        companyName,
        jobLocation: jobLocation ?? null,
        winner: { id: top.org.id, name: top.org.name, score: top.score },
        secondScore: second?.score ?? null,
        ambiguityRatio: AMBIGUITY_RATIO,
        ambiguityFloor,
        rankings,
      }),
    )
    return {
      kind: 'picked',
      best: {
        organizationId: top.org.id,
        name: top.org.name,
        primaryDomain: top.org.primary_domain ?? null,
      },
    }
  }

  const inAmbiguityBand = scored.filter((row) => row.score > ambiguityFloor)
  const candidates: OrgDisambiguationCandidate[] = inAmbiguityBand.map((row) => ({
    apollo_organization_id: row.org.id,
    name: row.org.name,
    primary_domain: row.org.primary_domain ?? null,
    score: row.score,
  }))
  console.log(
    JSON.stringify({
      fn: 'apollo:org-score',
      outcome: 'needs_user_choice',
      companyName,
      jobLocation: jobLocation ?? null,
      ambiguityRatio: AMBIGUITY_RATIO,
      ambiguityFloor,
      topScore: top.score,
      secondScore: second.score,
      candidateCount: candidates.length,
      rankings,
    }),
  )
  return { kind: 'needs_user_choice', candidates }
}

export function hiringTitlePhrases(
  roleCategory: string | null | undefined,
  jobTitle: string | null | undefined,
): string[] {
  const generic = [
    'recruiter',
    'talent acquisition',
    'human resources',
    'hr manager',
    'people operations',
    'hiring manager',
  ]
  const role = (roleCategory ?? 'other').toLowerCase()
  const jt = (jobTitle ?? '').toLowerCase()
  const extra: string[] = []
  if (jt) extra.push(jt)
  if (role === 'engineering' || jt.includes('engineer')) {
    extra.push('engineering manager', 'director of engineering', 'vp engineering')
  } else if (role === 'maintenance' || role === 'operations') {
    extra.push('operations manager', 'plant manager', 'facilities manager')
  } else if (role === 'management') {
    extra.push('general manager', 'operations director')
  } else if (role === 'executive') {
    extra.push('chief people officer', 'vp human resources')
  }
  return [...new Set([...generic, ...extra])].slice(0, 12)
}

function titleMatchScore(personTitle: string, phrases: string[]): number {
  const t = personTitle.toLowerCase()
  let s = 0
  for (const p of phrases) {
    if (p && t.includes(p.toLowerCase())) s += 15
  }
  return s
}

/**
 * Decision-maker seniority — used to surface actual hiring managers/leaders for Premium,
 * where the "important people" matter more than a recruiter/HR title match.
 */
function seniorityScore(title: string): number {
  const t = title.toLowerCase()
  let s = 0
  if (/\b(ceo|cto|coo|cfo|cpo|cmo|cio|ciso|chro)\b/.test(t) || t.includes('chief')) s += 50
  if (t.includes('vice president') || /\bvp\b/.test(t)) s += 40
  if (t.includes('head of')) s += 35
  if (t.includes('director')) s += 30
  if (t.includes('hiring manager')) s += 28
  if (t.includes('manager')) s += 20
  if (t.includes('principal') || t.includes('lead')) s += 10
  return s
}

/**
 * Rank people and return up to `count` distinct candidates (deduped by id).
 * Email-reachable contacts always sort first (they're actionable). With
 * `prioritizeSeniority` (Premium), decision-maker rank is the primary tiebreaker
 * so the hiring manager/leader surfaces ahead of a recruiter; otherwise (Core)
 * we keep the recruiter/HR-oriented title match.
 */
export function pickTopPeople(
  people: ApolloPersonSearchHit[],
  phrases: string[],
  count: number,
  opts?: { prioritizeSeniority?: boolean },
): ApolloPersonSearchHit[] {
  if (count <= 0) return []
  const ranked = [...people].sort((a, b) => {
    const ae = a.has_email === true ? 1 : 0
    const be = b.has_email === true ? 1 : 0
    if (be !== ae) return be - ae
    if (opts?.prioritizeSeniority) {
      const asn = seniorityScore(a.title ?? '')
      const bsn = seniorityScore(b.title ?? '')
      if (bsn !== asn) return bsn - asn
    }
    const at = titleMatchScore(a.title ?? '', phrases)
    const bt = titleMatchScore(b.title ?? '', phrases)
    return bt - at
  })
  const out: ApolloPersonSearchHit[] = []
  const seen = new Set<string>()
  for (const p of ranked) {
    if (!p.id || seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
    if (out.length >= count) break
  }
  return out
}

export function pickBestPerson(
  people: ApolloPersonSearchHit[],
  phrases: string[],
): ApolloPersonSearchHit | null {
  return pickTopPeople(people, phrases, 1)[0] ?? null
}

function apolloHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Accept: 'application/json',
    'X-Api-Key': apiKey,
  }
}

function buildQuery(params: Record<string, string | number | string[] | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    if (Array.isArray(v)) {
      for (const item of v) {
        q.append(`${k}[]`, item)
      }
    } else {
      q.append(k, String(v))
    }
  }
  return q.toString()
}

export async function searchOrganizationsByName(
  apiKey: string,
  companyName: string,
  jobLocation: string | null | undefined,
): Promise<ApolloOrgCandidate[]> {
  const params: Record<string, string | number | string[] | undefined> = {
    q_organization_name: stripLegalSuffixes(companyName),
    per_page: 5,
    page: 1,
  }
  // Do not send job location as organization_locations[] — Apollo treats that as HQ location,
  // which breaks many legitimate searches (e.g. subsidiary name + job city).
  const loc = jobLocation?.trim()
  const url = `${APOLLO_BASE}/mixed_companies/search?${buildQuery(params)}`
  const res = await fetch(url, { method: 'POST', headers: apolloHeaders(apiKey), body: '{}' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apollo org search ${res.status}: ${text.slice(0, 500)}`)
  }
  const json = (await res.json()) as Record<string, unknown>
  const orgsField = json['organizations']
  const rawList = Array.isArray(orgsField) ? orgsField : []
  const orgs = (rawList as ApolloOrgCandidate[]).filter((o) => o?.id && o?.name)
  console.log(
    JSON.stringify({
      fn: 'apollo:org-search',
      q_organization_name: params.q_organization_name,
      has_location_filter: false,
      job_location_for_scoring_only: loc || null,
      responseTopLevelKeys: Object.keys(json),
      organizationsArrayLength: Array.isArray(orgsField) ? orgsField.length : null,
      candidatesAfterIdNameFilter: orgs.length,
      candidateSummaries: orgs.slice(0, 5).map((o) => ({
        id: o.id,
        name: o.name,
        domain: o.primary_domain ?? null,
      })),
    }),
  )
  return orgs
}

export async function searchPeopleAtOrganization(
  apiKey: string,
  organizationId: string,
  personTitles: string[],
): Promise<ApolloPersonSearchHit[]> {
  const params: Record<string, string | number | string[] | undefined> = {
    organization_ids: [organizationId],
    person_titles: personTitles,
    per_page: 10,
    page: 1,
  }
  const url = `${APOLLO_BASE}/mixed_people/api_search?${buildQuery(params)}`
  const res = await fetch(url, { method: 'POST', headers: apolloHeaders(apiKey), body: '{}' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apollo people search ${res.status}: ${text.slice(0, 500)}`)
  }
  const json = (await res.json()) as Record<string, unknown>
  const peopleField = json['people']
  const people = Array.isArray(peopleField) ? (peopleField as ApolloPersonSearchHit[]) : []
  console.log(
    JSON.stringify({
      fn: 'apollo:people-search',
      organizationId,
      titleSample: personTitles.slice(0, 8),
      responseTopLevelKeys: Object.keys(json),
      peopleArrayLength: Array.isArray(peopleField) ? peopleField.length : null,
      peopleCount: people.length,
    }),
  )
  return people
}

export function employerNamePlausible(
  jobCompanyName: string,
  personOrgName: string | null | undefined,
): boolean {
  if (!personOrgName?.trim()) return false
  const s = nameScore(jobCompanyName, personOrgName)
  return s >= 25
}

export async function matchPersonById(
  apiKey: string,
  personId: string,
): Promise<{ person: Record<string, unknown> | null; creditError: boolean }> {
  const params = new URLSearchParams()
  params.set('id', personId)
  params.set('reveal_personal_emails', 'false')
  const url = `${APOLLO_BASE}/people/match?${params.toString()}`
  const res = await fetch(url, { method: 'POST', headers: apolloHeaders(apiKey), body: '{}' })
  const text = await res.text()
  if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 429) {
    console.log(
      JSON.stringify({
        fn: 'apollo:people-match',
        personId,
        outcome: 'credit_http',
        httpStatus: res.status,
      }),
    )
    return { person: null, creditError: true }
  }
  if (!res.ok) {
    if (text.toLowerCase().includes('credit')) {
      console.log(
        JSON.stringify({
          fn: 'apollo:people-match',
          personId,
          outcome: 'credit_body',
          httpStatus: res.status,
        }),
      )
      return { person: null, creditError: true }
    }
    throw new Error(`Apollo people match ${res.status}: ${text.slice(0, 500)}`)
  }
  let json: { person?: Record<string, unknown> }
  try {
    json = JSON.parse(text) as { person?: Record<string, unknown> }
  } catch {
    console.log(
      JSON.stringify({
        fn: 'apollo:people-match',
        personId,
        outcome: 'json_parse_error',
      }),
    )
    return { person: null, creditError: false }
  }
  const person = json.person ?? null
  console.log(
    JSON.stringify({
      fn: 'apollo:people-match',
      personId,
      outcome: person ? 'has_person' : 'empty_person',
      hasEmail: !!(person && typeof person.email === 'string' && person.email),
    }),
  )
  return { person, creditError: false }
}

export function personToMatchedContact(person: Record<string, unknown>): MatchedContact {
  const first = typeof person.first_name === 'string' ? person.first_name : ''
  const last = typeof person.last_name === 'string' ? person.last_name : ''
  const nameField = typeof person.name === 'string' ? person.name : `${first} ${last}`.trim()
  const title = typeof person.title === 'string' ? person.title : null
  const email = typeof person.email === 'string' ? person.email : null
  const city = typeof person.city === 'string' ? person.city : ''
  const state = typeof person.state === 'string' ? person.state : ''
  const country = typeof person.country === 'string' ? person.country : ''
  const locParts = [city, state, country].filter(Boolean)
  const location = locParts.length ? locParts.join(', ') : null
  const id = typeof person.id === 'string' ? person.id : ''
  const note =
    email == null || email === ''
      ? 'Email not available from Apollo for this contact.'
      : null
  return {
    apolloPersonId: id,
    name: nameField || 'Unknown',
    title,
    email,
    location,
    note,
  }
}
