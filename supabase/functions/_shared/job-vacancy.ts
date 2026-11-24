// Is a job still open? Checked against the employer's ATS, never guessed.
//
// Rules by apply-link host:
//   Greenhouse       boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}   200 open, 404 closed
//   Lever            api.lever.co/v0/postings/{company}/{id}                200 open, 404 closed
//   Ashby            api.ashbyhq.com/posting-api/job-board/{org}            id listed = open, missing = closed
//                    (Ashby has no per-job endpoint; a 404 board = closed)
//   SmartRecruiters  api.smartrecruiters.com/v1/companies/{co}/postings/{id} 200 open, 404 closed
//   iCIMS            the apply page itself                                 404/410 closed, 2xx open
//   BambooHR         the apply page itself                                 redirect to /careers closed, 2xx open
//   Workday          {host}/wday/cxs/{tenant}/{site}/job/{path}            jobPostingInfo open, 404 or 4xx error payload closed
//   Workable         apply.workable.com/api/v2/accounts/{acct}/jobs/{code} 200 open, 404 closed
//   any other host   the page itself (generic_page): closed phrases or an expired JobPosting
//                    validThrough = closed; JobPosting JSON-LD still valid = 'likely_open';
//                    anything else = unverified
//   Indeed           never checked -> 'unverified', no request made.
// grnh.se and apply.workable.com/j/ short links are resolved by their first redirect.
//
// Polite by construction: one request per second per host, 10s timeout, an identifying
// User-Agent, and redirects followed manually (at most 3). Any error, timeout or unexpected
// status is 'unverified' -- never 'open'.

/** likely_open: only a page's own structured data says it's live; weaker than an ATS answer. */
export type VacancyStatus = 'open' | 'likely_open' | 'closed' | 'unverified'

export interface VacancyResult {
  status: VacancyStatus
  /** Which rule decided: greenhouse_api, lever_api, ashby_api, smartrecruiters_api, workday_api, workable_api, icims_page, bamboohr_page, generic_page, unsupported_host, unparsed_url, error. */
  method: string
  /** Status of the deciding response; null when no request was made or it failed. */
  httpStatus: number | null
  checkedAt: string
  /** ATS family the apply link belongs to (for per-host stats). */
  host: string
  detail?: string
}

export const VACANCY_USER_AGENT = 'JobHopperVacancyCheck/1.0 (+https://job-hopper.io; job-listing freshness check)'
export const VACANCY_TIMEOUT_MS = 10_000
export const VACANCY_MAX_REDIRECTS = 3
export const VACANCY_MIN_INTERVAL_MS = 1_000

export interface VacancyDeps {
  fetch: typeof fetch
  now: () => number
  sleep: (ms: number) => Promise<void>
}

const defaultDeps: VacancyDeps = {
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
}

/** One request per `minIntervalMs` per hostname. */
export class HostThrottle {
  private next = new Map<string, number>()
  constructor(private deps: Pick<VacancyDeps, 'now' | 'sleep'>, private minIntervalMs = VACANCY_MIN_INTERVAL_MS) {}

  async wait(hostname: string): Promise<void> {
    const now = this.deps.now()
    const at = Math.max(now, this.next.get(hostname) ?? 0)
    this.next.set(hostname, at + this.minIntervalMs)
    if (at > now) await this.deps.sleep(at - now)
  }
}

/** ATS family for stats and rule selection, from a hostname. */
export function atsHost(hostname: string): string {
  const h = hostname.toLowerCase()
  const families: [string, string][] = [
    ['grnh.se', 'greenhouse'],
    ['greenhouse.io', 'greenhouse'],
    ['lever.co', 'lever'],
    ['ashbyhq.com', 'ashby'],
    ['smartrecruiters.com', 'smartrecruiters'],
    ['icims.com', 'icims'],
    ['bamboohr.com', 'bamboohr'],
    ['myworkdayjobs.com', 'workday'],
    ['workable.com', 'workable'],
    ['indeed.com', 'indeed'],
    ['adp.com', 'adp'],
  ]
  for (const [suffix, family] of families) if (h === suffix || h.endsWith('.' + suffix)) return family
  return h.replace(/^www\./, '')
}

type Http = (url: string) => Promise<{ status: number; location: string | null; body: () => Promise<string> }>

function makeHttp(deps: VacancyDeps, throttle: HostThrottle): Http {
  return async (url) => {
    await throttle.wait(new URL(url).hostname)
    const res = await deps.fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': VACANCY_USER_AGENT, Accept: 'application/json, text/html;q=0.9' },
      signal: AbortSignal.timeout(VACANCY_TIMEOUT_MS),
    })
    return { status: res.status, location: res.headers.get('location'), body: () => res.text() }
  }
}

const isRedirect = (s: number) => s >= 300 && s < 400

/** Follow up to VACANCY_MAX_REDIRECTS hops; returns the final response and URL. */
async function follow(http: Http, url: string) {
  let current = url
  for (let hop = 0; ; hop++) {
    const res = await http(current)
    if (!isRedirect(res.status) || !res.location) return { res, url: current, hops: hop }
    if (hop === VACANCY_MAX_REDIRECTS) return { res, url: current, hops: hop, tooMany: true }
    current = new URL(res.location, current).toString()
  }
}

type Check = (http: Http, url: URL) => Promise<Omit<VacancyResult, 'checkedAt' | 'host'>>

const byStatus = (method: string, status: number) =>
  status === 200
    ? { status: 'open' as const, method, httpStatus: status }
    : status === 404
      ? { status: 'closed' as const, method, httpStatus: status }
      : { status: 'unverified' as const, method, httpStatus: status, detail: `unexpected status ${status}` }

const unparsed = (detail: string) => ({ status: 'unverified' as const, method: 'unparsed_url', httpStatus: null, detail })

/** {board, id} from a Greenhouse board URL (boards., job-boards., embed links). */
export function parseGreenhouse(url: URL): { board: string; id: string } | null {
  const embedBoard = url.searchParams.get('for')
  const embedId = url.searchParams.get('token')
  if (embedBoard && embedId) return { board: embedBoard, id: embedId }
  const m = url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/)
  return m ? { board: m[1], id: m[2] } : null
}

const checkGreenhouse: Check = async (http, url) => {
  let target = url
  if (url.hostname.toLowerCase() === 'grnh.se') {
    // Resolve the short link by its first redirect only: a closed job's board page
    // redirects again to the board index, which no longer carries the job id.
    const res = await http(url.toString())
    if (!isRedirect(res.status) || !res.location) {
      return { status: 'unverified', method: 'greenhouse_api', httpStatus: res.status, detail: 'short link did not redirect' }
    }
    target = new URL(res.location, url)
    if (!/greenhouse\.io$/i.test(target.hostname)) {
      return unparsed('short link resolves to a company site, not a Greenhouse board')
    }
  }
  const parsed = parseGreenhouse(target)
  if (!parsed) return unparsed('no board/job id in Greenhouse URL')
  const res = await http(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parsed.board)}/jobs/${parsed.id}`)
  return byStatus('greenhouse_api', res.status)
}

const checkLever: Check = async (http, url) => {
  const m = url.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})/i)
  if (!m) return unparsed('no company/posting id in Lever URL')
  const res = await http(`https://api.lever.co/v0/postings/${encodeURIComponent(m[1])}/${m[2]}`)
  return byStatus('lever_api', res.status)
}

const checkAshby: Check = async (http, url) => {
  const m = url.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})/i)
  if (!m) return unparsed('no org/job id in Ashby URL')
  const res = await http(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(m[1])}`)
  if (res.status === 404) return { status: 'closed', method: 'ashby_api', httpStatus: 404, detail: 'job board not found' }
  if (res.status !== 200) return byStatus('ashby_api', res.status)
  let jobs: { id?: string }[] = []
  try {
    jobs = (JSON.parse(await res.body()) as { jobs?: { id?: string }[] }).jobs ?? []
  } catch {
    return { status: 'unverified', method: 'ashby_api', httpStatus: 200, detail: 'unreadable job board response' }
  }
  const listed = jobs.some((j) => j.id?.toLowerCase() === m[2].toLowerCase())
  return listed
    ? { status: 'open', method: 'ashby_api', httpStatus: 200 }
    : { status: 'closed', method: 'ashby_api', httpStatus: 200, detail: 'job not on the published board' }
}

const checkSmartRecruiters: Check = async (http, url) => {
  const m = url.pathname.match(/^\/([^/]+)\/(\d+)/)
  if (!m) return unparsed('no company/posting id in SmartRecruiters URL')
  const res = await http(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(m[1])}/postings/${m[2]}`)
  return byStatus('smartrecruiters_api', res.status)
}

const checkIcims: Check = async (http, url) => {
  const { res, tooMany } = await follow(http, url.toString())
  if (res.status === 404 || res.status === 410) return { status: 'closed', method: 'icims_page', httpStatus: res.status }
  if (res.status >= 200 && res.status < 300) return { status: 'open', method: 'icims_page', httpStatus: res.status }
  return { status: 'unverified', method: 'icims_page', httpStatus: res.status, detail: tooMany ? 'too many redirects' : `unexpected status ${res.status}` }
}

/** BambooHR sends a closed posting back to the careers index. */
export function isBambooCareersIndex(location: string, base: string): boolean {
  return /\/careers\/?$/i.test(new URL(location, base).pathname)
}

const checkBamboo: Check = async (http, url) => {
  const res = await http(url.toString())
  if (isRedirect(res.status) && res.location && isBambooCareersIndex(res.location, url.toString())) {
    return { status: 'closed', method: 'bamboohr_page', httpStatus: res.status, detail: 'redirected to /careers' }
  }
  if (res.status >= 200 && res.status < 300) return { status: 'open', method: 'bamboohr_page', httpStatus: res.status }
  return { status: 'unverified', method: 'bamboohr_page', httpStatus: res.status, detail: `unexpected status ${res.status}` }
}

/** Workday's public JSON endpoint for an apply link, or null if the link isn't a job page. */
export function workdayApiUrl(url: URL): string | null {
  const tenant = url.hostname.match(/^([^.]+)\.wd\d+\.myworkdayjobs\.com$/i)?.[1]
  if (!tenant) return null
  const segs = url.pathname.split('/').filter(Boolean)
  if (/^[a-z]{2}-[a-z]{2}$/i.test(segs[0] ?? '')) segs.shift() // optional locale, e.g. en-US
  const [site, kind, ...rest] = segs
  if (!site || kind !== 'job' || rest.length === 0) return null
  return `https://${url.host}/wday/cxs/${tenant}/${site}/job/${rest.join('/')}`
}

const checkWorkday: Check = async (http, url) => {
  const api = workdayApiUrl(url)
  if (!api) return unparsed('no tenant/site/job path in Workday URL')
  const res = await http(api)
  let payload: { jobPostingInfo?: unknown; errorCode?: string } | null = null
  try {
    payload = JSON.parse(await res.body())
  } catch {
    payload = null
  }
  if (res.status === 200 && payload?.jobPostingInfo) return { status: 'open', method: 'workday_api', httpStatus: 200 }
  if (res.status === 404) return { status: 'closed', method: 'workday_api', httpStatus: 404 }
  // A 4xx with Workday's error payload (e.g. S22 "permission denied") is what an unlisted
  // posting returns; a 5xx is Workday having trouble and says nothing about the job.
  if (res.status >= 400 && res.status < 500 && payload?.errorCode) {
    return { status: 'closed', method: 'workday_api', httpStatus: res.status, detail: `error ${payload.errorCode}` }
  }
  return { status: 'unverified', method: 'workday_api', httpStatus: res.status, detail: `unexpected status ${res.status}` }
}

const checkWorkable: Check = async (http, url) => {
  let target = url
  if (/^\/j\/[^/]+/.test(url.pathname)) {
    const res = await http(url.toString()) // /j/{code} redirects to /{account}/j/{code}
    if (!isRedirect(res.status) || !res.location) {
      return { status: 'unverified', method: 'workable_api', httpStatus: res.status, detail: 'short link did not redirect' }
    }
    target = new URL(res.location, url)
  }
  const m = target.pathname.match(/^\/([^/]+)\/j\/([A-Za-z0-9]+)/)
  if (!m) return unparsed('no account/shortcode in Workable URL')
  const res = await http(`https://apply.workable.com/api/v2/accounts/${encodeURIComponent(m[1])}/jobs/${m[2]}`)
  return byStatus('workable_api', res.status)
}

export const CLOSED_PHRASES = [
  'no longer accepting applications',
  'no longer accepting applicants',
  'position has been filled',
  'this position is filled',
  'job not found',
  'this job has expired',
  'job posting has expired',
  'this posting has expired',
  'this job is no longer available',
  'this position is no longer available',
  'job is no longer available',
  'position is no longer open',
  'this job is closed',
  'this position has been closed',
  'job has been closed',
]

/** Visible text only: script/style content (e.g. i18n bundles) never counts as page copy. */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#39;|&rsquo;|&#8217;/gi, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Every schema.org JobPosting object in the page's JSON-LD blocks (top level, arrays, @graph). */
export function jobPostingsFromJsonLd(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = []
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    const o = node as Record<string, unknown>
    const type = o['@type']
    if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) found.push(o)
    if (o['@graph']) visit(o['@graph'])
  }
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(re)) {
    try {
      visit(JSON.parse(m[1].trim()))
    } catch {
      // malformed JSON-LD is just ignored
    }
  }
  return found
}

/** Pure decision for the generic page rule. */
export function judgeGenericPage(
  status: number,
  html: string,
  nowMs: number,
): { status: VacancyStatus; detail?: string } {
  const text = visibleText(html)
  const phrase = CLOSED_PHRASES.find((p) => text.includes(p))
  if (phrase) return { status: 'closed', detail: `page says "${phrase}"` }
  if (status < 200 || status >= 300) return { status: 'unverified', detail: `status ${status}, no closed text` }
  const postings = jobPostingsFromJsonLd(html)
  if (postings.length === 0) return { status: 'unverified', detail: 'no JobPosting JSON-LD' }
  const expired = (p: Record<string, unknown>) => {
    const ms = typeof p.validThrough === 'string' ? Date.parse(p.validThrough) : NaN
    return !Number.isNaN(ms) && ms < nowMs
  }
  if (postings.every(expired)) return { status: 'closed', detail: 'JobPosting validThrough is in the past' }
  return { status: 'likely_open', detail: 'JobPosting JSON-LD present and not expired' }
}

function makeGenericCheck(now: () => number): Check {
  return async (http, url) => {
    const { res, tooMany } = await follow(http, url.toString())
    if (tooMany) return { status: 'unverified', method: 'generic_page', httpStatus: res.status, detail: 'too many redirects' }
    const verdict = judgeGenericPage(res.status, await res.body(), now())
    return { ...verdict, method: 'generic_page', httpStatus: res.status }
  }
}

const CHECKS: Record<string, Check> = {
  greenhouse: checkGreenhouse,
  lever: checkLever,
  ashby: checkAshby,
  smartrecruiters: checkSmartRecruiters,
  icims: checkIcims,
  bamboohr: checkBamboo,
  workday: checkWorkday,
  workable: checkWorkable,
}

/** Hosts we never request (job boards that block or forbid automated checks). */
export const NEVER_CHECK_HOSTS = new Set(['indeed'])

export interface VacancyVerifier {
  verify(applyLink: string | null): Promise<VacancyResult>
}

/** A verifier with its own per-host throttle; share one instance across a whole run. */
export function createVacancyVerifier(overrides: Partial<VacancyDeps> = {}): VacancyVerifier {
  const deps = { ...defaultDeps, ...overrides }
  const http = makeHttp(deps, new HostThrottle(deps))
  const generic = makeGenericCheck(deps.now)
  return {
    async verify(applyLink) {
      const checkedAt = () => new Date(deps.now()).toISOString()
      let url: URL
      try {
        url = new URL((applyLink ?? '').trim())
        if (!/^https?:$/.test(url.protocol)) throw new Error('not http')
      } catch {
        return { status: 'unverified', method: 'unparsed_url', httpStatus: null, checkedAt: checkedAt(), host: 'none', detail: 'missing or invalid apply link' }
      }
      const host = atsHost(url.hostname)
      if (NEVER_CHECK_HOSTS.has(host)) {
        return { status: 'unverified', method: 'unsupported_host', httpStatus: null, checkedAt: checkedAt(), host }
      }
      const check = CHECKS[host] ?? generic
      try {
        return { ...(await check(http, url)), checkedAt: checkedAt(), host }
      } catch (e) {
        const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
        return { status: 'unverified', method: 'error', httpStatus: null, checkedAt: checkedAt(), host, detail }
      }
    },
  }
}
