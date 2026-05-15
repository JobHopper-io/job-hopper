/** Apollo.io helpers for hiring-contact lookup (mixed people search + email reveal). */

export type RoleCategoryForApollo =
  | 'operations'
  | 'maintenance'
  | 'engineering'
  | 'management'
  | 'executive'
  | 'other'

const GENERIC_HIRING_TITLES = [
  'hiring manager',
  'talent acquisition',
  'recruiter',
  'people operations',
]

export const HIRING_TITLES_BY_ROLE: Record<RoleCategoryForApollo, string[]> = {
  operations: ['operations manager', 'director of operations', 'vp operations', 'plant manager', 'site director'],
  maintenance: ['maintenance manager', 'maintenance supervisor', 'facilities manager', 'director of maintenance'],
  engineering: ['engineering manager', 'director of engineering', 'vp engineering', 'lead engineer', 'chief engineer'],
  management: ['general manager', 'operations manager', 'director', 'vp'],
  executive: ['ceo', 'coo', 'president', 'founder', 'managing partner'],
  other: [],
}

function buildPersonTitles(roleCategory: string | null | undefined): string[] {
  const key = (roleCategory ?? 'other').toLowerCase() as RoleCategoryForApollo
  const roleSpecific =
    key in HIRING_TITLES_BY_ROLE ? HIRING_TITLES_BY_ROLE[key as RoleCategoryForApollo] : []
  const combined = [...GENERIC_HIRING_TITLES, ...roleSpecific]
  return Array.from(new Set(combined.map((t) => t.trim().toLowerCase()).filter(Boolean)))
}

export interface ApolloPersonHit {
  id: string
  name?: string | null
  title?: string | null
  linkedin_url?: string | null
  email?: string | null
}

export interface ApolloRevealResult {
  id: string
  first_name?: string | null
  last_name?: string | null
  title?: string | null
  linkedin_url?: string | null
  email?: string | null
}

export interface ApolloLookupDeps {
  apiKey: string
  headerName: string
}

async function apolloPost<T>(
  deps: ApolloLookupDeps,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const url = `https://api.apollo.io/api/v1/${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [deps.headerName]: deps.apiKey,
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: T | null = null
  try {
    data = text ? JSON.parse(text) as T : null
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data, text }
}

/** Resolve primary domain from company name via Apollo org search. */
export async function resolveOrganizationDomain(
  deps: ApolloLookupDeps,
  companyName: string,
): Promise<string | null> {
  const q = companyName.trim()
  if (!q) return null

  const { ok, data } = await apolloPost<{
    organizations?: { primary_domain?: string | null }[]
    accounts?: { organization?: { primary_domain?: string | null } }[]
  }>(deps, 'mixed_companies/search', {
    q_organization_name: q,
    page: 1,
    per_page: 5,
  })

  if (!ok || !data) return null

  const orgs = data.organizations ?? []
  for (const o of orgs) {
    const d = o.primary_domain?.trim()
    if (d) return d.toLowerCase()
  }

  const accounts = data.accounts ?? []
  for (const a of accounts) {
    const d = a.organization?.primary_domain?.trim()
    if (d) return d.toLowerCase()
  }

  return null
}

function normalizePersonFromHit(hit: Record<string, unknown>): ApolloPersonHit | null {
  const id = typeof hit.id === 'string' ? hit.id : typeof hit._id === 'string' ? hit._id : ''
  if (!id) return null

  const firstName = typeof hit.first_name === 'string' ? hit.first_name : ''
  const lastName = typeof hit.last_name === 'string' ? hit.last_name : ''
  const name =
    typeof hit.name === 'string'
      ? hit.name
      : `${firstName} ${lastName}`.trim() || null

  const title = typeof hit.title === 'string' ? hit.title : null
  const linkedin_url =
    typeof hit.linkedin_url === 'string'
      ? hit.linkedin_url
      : typeof (hit as { linkedinUrl?: string }).linkedinUrl === 'string'
        ? (hit as { linkedinUrl?: string }).linkedinUrl ?? null
        : null

  const email = typeof hit.email === 'string' ? hit.email : null

  return { id, name, title, linkedin_url, email }
}

/** Rank best hiring candidate: prefer role-specific titles over generic TA/recruiter when roleCategory helps. */
export function pickBestPerson(
  hits: ApolloPersonHit[],
  roleCategory: string | null | undefined,
): ApolloPersonHit | null {
  if (!hits.length) return null

  const roleSpecific =
    roleCategory && roleCategory in HIRING_TITLES_BY_ROLE
      ? HIRING_TITLES_BY_ROLE[roleCategory as RoleCategoryForApollo]
      : []

  const genericNeedles = GENERIC_HIRING_TITLES.map((t) => t.toLowerCase())
  const roleNeedles = roleSpecific.map((t) => t.toLowerCase())

  function scoreTitle(title: string | null | undefined): number {
    const t = (title ?? '').toLowerCase()
    if (!t) return 0
    let s = 1
    for (const n of roleNeedles) {
      if (n && t.includes(n)) s += 6
    }
    for (const n of genericNeedles) {
      if (n && t.includes(n)) s += 2
    }
    return s
  }

  let best = hits[0]
  let bestScore = scoreTitle(best.title)
  for (let i = 1; i < hits.length; i++) {
    const h = hits[i]
    const sc = scoreTitle(h.title)
    if (sc > bestScore) {
      best = h
      bestScore = sc
    }
  }
  return best
}

export async function searchPeopleAtDomain(
  deps: ApolloLookupDeps,
  domain: string,
  roleCategory: string | null | undefined,
): Promise<ApolloPersonHit[]> {
  const personTitles = buildPersonTitles(roleCategory)

  const { ok, data } = await apolloPost<{
    people?: Record<string, unknown>[]
  }>(deps, 'mixed_people/search', {
    page: 1,
    per_page: 10,
    q_organization_domains: [domain],
    person_titles: personTitles,
  })

  if (!ok || !data?.people?.length) return []

  const out: ApolloPersonHit[] = []
  for (const row of data.people) {
    const p = normalizePersonFromHit(row)
    if (p) out.push(p)
  }
  return out
}

export async function revealPersonEmails(
  deps: ApolloLookupDeps,
  personId: string,
): Promise<{ ok: boolean; status: number; person: ApolloRevealResult | null; rawText: string }> {
  const { ok, status, data, text } = await apolloPost<{
    person?: Record<string, unknown>
  }>(deps, 'people/match', {
    id: personId,
    reveal_personal_emails: true,
  })

  if (!ok || !data?.person) {
    return { ok: false, status, person: null, rawText: text }
  }

  const hit = data.person
  const id = typeof hit.id === 'string' ? hit.id : personId
  const first_name = typeof hit.first_name === 'string' ? hit.first_name : null
  const last_name = typeof hit.last_name === 'string' ? hit.last_name : null
  const title = typeof hit.title === 'string' ? hit.title : null
  const linkedin_url =
    typeof hit.linkedin_url === 'string'
      ? hit.linkedin_url
      : typeof (hit as { linkedinUrl?: string }).linkedinUrl === 'string'
        ? (hit as { linkedinUrl?: string }).linkedinUrl ?? null
        : null

  let email: string | null =
    typeof hit.email === 'string'
      ? hit.email
      : typeof hit.corporate_email === 'string'
        ? hit.corporate_email
        : null

  if (!email && Array.isArray(hit.contact_emails)) {
    const first = hit.contact_emails[0] as Record<string, unknown> | undefined
    if (first && typeof first.email === 'string') email = first.email
  }

  const person: ApolloRevealResult = {
    id,
    first_name,
    last_name,
    title,
    linkedin_url,
    email,
  }

  return { ok: true, status, person, rawText: text }
}

export function truncateApolloRaw(payload: unknown, maxChars = 12000): unknown {
  try {
    const s = JSON.stringify(payload)
    if (s.length <= maxChars) return payload
    return { truncated: true, preview: s.slice(0, maxChars) }
  } catch {
    return { truncated: true }
  }
}
