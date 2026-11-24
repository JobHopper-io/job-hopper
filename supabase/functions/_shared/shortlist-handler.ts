/**
 * Request handling for the public shortlist edge function (verify_jwt = false). Kept out of
 * index.ts so tests can drive it without a server.
 *
 *   GET ?token=               -> the shortlist JSON for /s/:token, logs a view. Jobs whose
 *                                latest vacancy check is now 'closed' are hidden.
 *   GET /click?token=&job=    -> logs a click, 302 to that job's apply link. Only job ids in
 *                                that shortlist's own snapshot redirect: no open redirect.
 *
 * The token is the only credential. An unknown, malformed, expired or too_few shortlist is
 * a bare 404, identical in every case so tokens can't be probed.
 */
import { SHORTLIST_TOKEN_RE, type ShortlistJobSnapshot } from './prospect-shortlist.ts'

export interface StoredShortlist {
  id: string
  status: 'ready' | 'too_few'
  jobs: ShortlistJobSnapshot[]
  expires_at: string
  first_viewed_at: string | null
}

export interface ShortlistHandlerDeps {
  findByToken(token: string): Promise<StoredShortlist | null>
  /** Latest vacancy status per job id (jobs never checked are absent). */
  latestVacancy(jobIds: string[]): Promise<Map<string, string>>
  logEvent(shortlistId: string, event: 'view' | 'click', jobId: string | null): Promise<void>
  /** Sets first_viewed_at only if it is still null. */
  markFirstViewed(shortlistId: string, at: Date): Promise<void>
  /** Public base of this function, e.g. https://<ref>.supabase.co/functions/v1/shortlist */
  functionUrl: string
  now?: () => Date
}

/** What GET ?token= returns; no apply links: Apply goes through the tracked click_url. */
export interface PublicShortlist {
  expires_at: string
  jobs: {
    job_id: string
    title: string | null
    company: string | null
    location: string | null
    posted_date: string | null
    bullets: string[]
    click_url: string
  }[]
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const notFound = () => new Response('Not found', { status: 404, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } })

export function createShortlistHandler(deps: ShortlistHandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date())

  async function live(token: string | null): Promise<StoredShortlist | null> {
    if (!token || !SHORTLIST_TOKEN_RE.test(token)) return null
    const s = await deps.findByToken(token)
    if (!s || s.status !== 'ready' || Date.parse(s.expires_at) <= now().getTime()) return null
    return s
  }

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

    const url = new URL(req.url)
    const token = url.searchParams.get('token')

    if (url.pathname.replace(/\/+$/, '').endsWith('/click')) {
      const s = await live(token)
      const jobId = url.searchParams.get('job')
      const job = s && jobId ? s.jobs.find((j) => j.job_id === jobId) : undefined
      if (!s || !job || !job.apply_link || !/^https?:\/\//i.test(job.apply_link)) return notFound()
      await deps.logEvent(s.id, 'click', job.job_id)
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: job.apply_link, 'Cache-Control': 'no-store' } })
    }

    const s = await live(token)
    if (!s) return notFound()

    const latest = await deps.latestVacancy(s.jobs.map((j) => j.job_id))
    const visible = s.jobs.filter((j) => latest.get(j.job_id) !== 'closed')
    await deps.logEvent(s.id, 'view', null)
    if (!s.first_viewed_at) await deps.markFirstViewed(s.id, now())

    const body: PublicShortlist = {
      expires_at: s.expires_at,
      jobs: visible.map((j) => ({
        job_id: j.job_id,
        title: j.title,
        company: j.company,
        location: j.location,
        posted_date: j.posted_date,
        bullets: j.bullets,
        click_url: `${deps.functionUrl}/click?${new URLSearchParams({ token: token!, job: j.job_id })}`,
      })),
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
}
