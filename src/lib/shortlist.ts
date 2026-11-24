import { supabase } from '@/lib/supabase'

/** One job on a public shortlist (shortlist edge function; mirrors _shared/shortlist-handler.ts). */
export interface PublicShortlistJob {
  job_id: string
  title: string | null
  company: string | null
  location: string | null
  posted_date: string | null
  bullets: string[]
  /** Tracked redirect to the apply link (logs the click). */
  click_url: string
}

export interface PublicShortlist {
  expires_at: string
  jobs: PublicShortlistJob[]
}

export type ShortlistLoadResult =
  | { status: 'ok'; shortlist: PublicShortlist }
  | { status: 'not_found' }
  | { status: 'error' }

/** Signup link for the shortlist page CTA, attributed to reverse recruiting on first touch. */
export const SHORTLIST_SIGNUP_URL = '/register?utm_source=shortlist&utm_campaign=reverse_recruiting'

export const shortlistAPI = {
  /** GETs /s/:token's data. Unknown, expired and unusable tokens are all 'not_found'. */
  async load(token: string): Promise<ShortlistLoadResult> {
    const { data, error } = await supabase.functions.invoke<PublicShortlist>(
      `shortlist?token=${encodeURIComponent(token)}`,
      { method: 'GET' },
    )
    if (!error && data) return { status: 'ok', shortlist: data }
    const ctx = (error as { context?: unknown } | null)?.context
    if (ctx instanceof Response && ctx.status === 404) return { status: 'not_found' }
    console.error('shortlist load failed:', error)
    return { status: 'error' }
  },
}
