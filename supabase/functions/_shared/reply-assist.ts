/**
 * Helpers for handling a classified reply: cleaning the text before it goes to an LLM,
 * extracting what the person asked for, drafting a suggested response, and the default
 * next action per class. Pure functions; reply-processing.ts does the orchestration.
 *
 * Drafts are suggestions for a person to review and send by hand. They are never sent
 * automatically, and guardDraft() rejects any draft that quotes prices, names jobs or
 * openings, or makes sponsorship claims, falling back to a fixed safe template.
 */
import type { AnyReplyClass, ReplyAudience } from './reply-classification-prompt.ts'

// --- text cleaning --------------------------------------------------------------------

const SIGNATURE_START = [
  /^--\s*$/, // RFC 3676 signature separator
  /^(sent from my|get outlook for)\b/i,
  /^(best|kind|warm)?\s*(regards|wishes)\b.{0,20}$/i,
  /^(thanks|thank you|many thanks|cheers|sincerely|best|all the best|warmly)[,.!]?\s*$/i,
]
const QUOTE_START = [
  /^on .{4,200}wrote:\s*$/i, // "On Mon, 1 Dec 2026, X <x@y> wrote:"
  /^-{2,}\s*original message\s*-{2,}/i,
  /^from:\s.+/i, // forwarded/quoted header block
]

/**
 * The part of a reply worth reading: drops quoted earlier messages ("On ... wrote:",
 * "> ..." lines), the signature (from the first sign-off line), then redacts any email
 * addresses, phone numbers and URLs left in the text. Capped at 4000 characters.
 */
export function cleanReplyText(body: string | null): string {
  if (!body) return ''
  const kept: string[] = []
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const t = line.trim()
    if (QUOTE_START.some((re) => re.test(t))) break
    if (t.startsWith('>')) continue
    if (kept.some((l) => l.trim()) && SIGNATURE_START.some((re) => re.test(t))) break
    kept.push(line)
  }
  return kept.join('\n')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[link]')
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[phone]')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000)
}

// --- extraction -----------------------------------------------------------------------

export interface ReplyExtraction {
  need: string | null
  roles: string[]
  locations: string[]
  timeline: string | null
  question: string | null
  sentiment: 'positive' | 'neutral' | 'negative'
}

export const EXTRACTION_SYSTEM = `You read one email reply and extract only what the sender says they want. Answer with a single JSON object and nothing else:

{"need": string|null, "roles": string[], "locations": string[], "timeline": string|null, "question": string|null, "sentiment": "positive"|"neutral"|"negative"}

- need: the stated need in one short line (max 120 characters), or null if none.
- roles: job titles or fields they mention wanting (not their current job), max 5.
- locations: places or "remote" they mention wanting, max 5.
- timeline: when they need it, in their words (e.g. "by January", "asap"), or null.
- question: the main question they ask, in one line, or null.
- sentiment: overall tone.

Do not include names, email addresses, phone numbers, employers or any other personal details. Never invent anything that isn't in the reply.`

const short = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => short(x, 60)).filter((x): x is string => !!x && !/@|\d{6,}/.test(x)).slice(0, 5) : []

/** Parses and sanitizes the extraction JSON (tolerates a ```json fence); null if unusable. */
export function parseExtraction(raw: string): ReplyExtraction | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let o: Record<string, unknown>
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    o = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const sentiment = o.sentiment === 'positive' || o.sentiment === 'negative' ? o.sentiment : 'neutral'
  const redact = (s: string | null) => s && s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]').replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[phone]')
  return {
    need: redact(short(o.need, 120)),
    roles: list(o.roles),
    locations: list(o.locations),
    timeline: short(o.timeline, 60),
    question: redact(short(o.question, 200)),
    sentiment,
  }
}

// --- drafts ---------------------------------------------------------------------------

/** Classes that never get a draft: nothing useful to say, or we must not reply. */
const NO_DRAFT = new Set<string>(['unsubscribe', 'Unsubscribe', 'out_of_office', 'Out of office', 'not_interested', 'Not interested'])
export const needsDraft = (c: AnyReplyClass | null): c is AnyReplyClass => c !== null && !NO_DRAFT.has(c)

export function draftSystemPrompt(audience: ReplyAudience, siteUrl: string): string {
  const who = audience === 'b2c'
    ? 'a job seeker who replied to an email from Job-Hopper (job-hopper.io, a job-matching service for job seekers)'
    : 'a contact at a university, employer or career-services partner who replied to an outbound email from Job-Hopper (job-hopper.io)'
  return `You write a short suggested reply (max 90 words, plain text, no subject line) to ${who}. A person on the Job-Hopper team will review and edit it before sending.

Hard rules:
- Never quote prices, amounts, discounts or plan costs. For any pricing question, point them to ${siteUrl}/pricing.
- Never name or promise specific jobs, openings, employers or numbers of matches.
- Never claim or promise visa sponsorship.
- Don't invent facts about the person or about Job-Hopper. If you don't know, offer to look into it.
- Answer what they asked, warmly and briefly. Sign off as "The Job-Hopper team".
Answer with the reply text only.`
}

const PRICE = /([$€£]\s?\d)|(\b\d+([.,]\d+)?\s?(usd|dollars?|eur|gbp|\/\s?(mo|month|yr|year)|per\s(month|year|seat)|a\s(month|year)))\b|\b\d{1,3}\s?%\s?(off|discount)/i
const INVENTED_JOBS = /\b(we|i)\s+(have|found|located|matched|lined up)\s+(\d+|a|an|several|some|a few)\s+(new\s+)?(open\s+)?(jobs?|roles?|positions?|openings?|matches)\b|\b\d+\s+(new\s+)?(jobs?|roles?|openings?|positions?|matches)\b|\b(is|are)\s+(hiring|recruiting)\b/i
const SPONSORSHIP = /\b(will|can|guarantee[sd]?|definitely)\s+(sponsor|provide sponsorship)|\bsponsors?\s+(your\s+)?visa|\bvisa\s+sponsorship\s+(is\s+)?(guaranteed|available|assured)/i

export type DraftProblem = 'price' | 'invented_jobs' | 'sponsorship' | 'empty'

export function draftProblems(draft: string): DraftProblem[] {
  const problems: DraftProblem[] = []
  if (!draft.trim()) problems.push('empty')
  if (PRICE.test(draft)) problems.push('price')
  if (INVENTED_JOBS.test(draft)) problems.push('invented_jobs')
  if (SPONSORSHIP.test(draft)) problems.push('sponsorship')
  return problems
}

/** Safe fixed text per class, used when there's no LLM draft or it broke a rule. */
export function fallbackDraft(replyClass: AnyReplyClass, siteUrl: string): string {
  const sign = '\n\nThe Job-Hopper team'
  const pricing = `Thanks for asking. All plans and what each one includes are on our pricing page: ${siteUrl}/pricing. Happy to answer anything it doesn't cover.`
  const byClass: Record<string, string> = {
    pricing,
    'Pricing question': pricing,
    role_request: `Thanks for telling us what you're looking for. We'll check your profile and matches and get back to you. Keeping your target role and locations up to date on your profile helps: ${siteUrl}/profile`,
    assistance: 'Thanks for letting us know. We\'re looking into it and will get back to you shortly. If you can, reply with what you were trying to do and what you saw.',
    not_now: 'Thanks for getting back to us. No problem at all; your account stays as it is whenever you want to pick it back up.',
    already_employed: 'Congratulations on the new role, and thanks for letting us know. You can turn our emails off from the link at the bottom of any of them.',
  }
  return (byClass[replyClass] ?? 'Thanks for your reply. We\'ll get back to you shortly.') + sign
}

/**
 * The draft to store: the LLM's text if it breaks none of the rules, otherwise the
 * class's safe fallback. A pricing draft always carries the pricing link.
 */
export function guardDraft(llmDraft: string | null, replyClass: AnyReplyClass, siteUrl: string): { draft: string; usedFallback: boolean; problems: DraftProblem[] } {
  const text = (llmDraft ?? '').trim().slice(0, 1200)
  const problems = draftProblems(text)
  if (problems.length) return { draft: fallbackDraft(replyClass, siteUrl), usedFallback: true, problems }
  const isPricing = replyClass === 'pricing' || replyClass === 'Pricing question'
  const draft = isPricing && !text.includes(`${siteUrl}/pricing`) ? `${text}\n\nPlans and pricing: ${siteUrl}/pricing` : text
  return { draft, usedFallback: false, problems }
}

// --- next actions ---------------------------------------------------------------------

/** Default next action and how long after the reply it's due; null = nothing to do. */
export const NEXT_ACTIONS: Record<AnyReplyClass, { action: string; dueDays: number } | null> = {
  // job seekers
  interested: { action: 'send shortlist', dueDays: 1 },
  role_request: { action: 'send matching roles', dueDays: 1 },
  pricing: { action: 'answer pricing', dueDays: 1 },
  assistance: { action: 'help with account', dueDays: 1 },
  not_now: { action: 'follow up', dueDays: 30 },
  not_interested: null,
  already_employed: null,
  unsubscribe: null,
  out_of_office: { action: 'follow up after return', dueDays: 7 },
  other: { action: 'review reply', dueDays: 2 },
  // institutional leads
  'Interested': { action: 'book a call', dueDays: 1 },
  'More information': { action: 'send information', dueDays: 1 },
  'Meeting requested': { action: 'schedule meeting', dueDays: 1 },
  'Referral': { action: 'contact referral', dueDays: 2 },
  'Not now': { action: 'follow up', dueDays: 30 },
  'Not interested': null,
  'Unsubscribe': null,
  'Out of office': { action: 'follow up after return', dueDays: 7 },
  'Wrong contact': { action: 'find right contact', dueDays: 3 },
  'Pricing question': { action: 'answer pricing', dueDays: 1 },
  'Partnership question': { action: 'reply about partnership', dueDays: 2 },
}

export function nextActionFor(replyClass: AnyReplyClass, receivedAt: string): { next_action: string | null; next_action_due: string | null } {
  const a = NEXT_ACTIONS[replyClass]
  if (!a) return { next_action: null, next_action_due: null }
  return { next_action: a.action, next_action_due: new Date(new Date(receivedAt).getTime() + a.dueDays * 86_400_000).toISOString() }
}
