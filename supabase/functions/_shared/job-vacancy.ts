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
//   anything else (Indeed, Workday, ADP, unknown) -> 'unverified', no request made.
// grnh.se short links are resolved first (they redirect to the board or the company site).
//
// Polite by construction: one request per second per host, 10s timeout, an identifying
// User-Agent, and redirects followed manually (at most 3). Any error, timeout or unexpected
// status is 'unverified' -- never 'open'.

export type VacancyStatus = 'open' | 'closed' | 'unverified'

export interface VacancyResult {
  status: VacancyStatus
  /** Which rule decided: greenhouse_api, lever_api, ashby_api, smartrecruiters_api, icims_page, bamboohr_page, unsupported_host, unparsed_url, error. */
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

const CHECKS: Record<string, Check> = {
  greenhouse: checkGreenhouse,
  lever: checkLever,
  ashby: checkAshby,
  smartrecruiters: checkSmartRecruiters,
  icims: checkIcims,
  bamboohr: checkBamboo,
}

export interface VacancyVerifier {
  verify(applyLink: string | null): Promise<VacancyResult>
}

/** A verifier with its own per-host throttle; share one instance across a whole run. */
export function createVacancyVerifier(overrides: Partial<VacancyDeps> = {}): VacancyVerifier {
  const deps = { ...defaultDeps, ...overrides }
  const http = makeHttp(deps, new HostThrottle(deps))
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
      const check = CHECKS[host]
      if (!check) return { status: 'unverified', method: 'unsupported_host', httpStatus: null, checkedAt: checkedAt(), host }
      try {
        return { ...(await check(http, url)), checkedAt: checkedAt(), host }
      } catch (e) {
        const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
        return { status: 'unverified', method: 'error', httpStatus: null, checkedAt: checkedAt(), host, detail }
      }
    },
  }
}
