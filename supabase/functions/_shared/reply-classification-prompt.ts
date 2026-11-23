/** LLM prompts for classifying inbound replies (reply_events.reply_class). Two class
 * sets, picked by who the reply matched (replyAudience):
 *   - b2b: replies from institutional leads (and unmatched senders) -- REPLY_CLASSES
 *   - b2c: replies from job seekers (a prospect or a signed-up profile, no lead) --
 *     B2C_REPLY_CLASSES
 * The b2b prompt below is unchanged. Mirrors growth-summary-prompt.ts: one prompt/build pair,
 * OpenAI-compatible chat completion, no n8n. Called by classify-replies.
 *
 * The 10 classes are the whole contract other code relies on -- REPLY_CLASSES is the
 * single source of truth for both the prompt and normalizeReplyClass's validation, so
 * the two can never drift apart. Unsubscribe is not "just another class": classify-replies
 * writes any Unsubscribe result straight into exclusion_lists (compliance), so the model
 * must never emit it as a loose guess -- see the system prompt's explicit rule below.
 */

export const REPLY_CLASSES = [
  'Interested',
  'More information',
  'Meeting requested',
  'Referral',
  'Not now',
  'Not interested',
  'Unsubscribe',
  'Out of office',
  'Wrong contact',
  'Pricing question',
  'Partnership question',
] as const

export type ReplyClass = (typeof REPLY_CLASSES)[number]

export const REPLY_CLASSIFICATION_SYSTEM = `You classify one inbound email reply to a cold B2B outbound email (job-hopper.io selling to universities, employers, and career partners). Read the reply and answer with EXACTLY ONE of these labels, verbatim, and nothing else -- no punctuation, no explanation:

${REPLY_CLASSES.map((c) => `- ${c}`).join('\n')}

Definitions:
- Interested: wants to move forward or learn more with clear positive intent (e.g. "this looks great, let's talk").
- More information: asks for details (case studies, how it works, specifics) without requesting a meeting or stating pricing/partnership as the actual question.
- Meeting requested: explicitly asks to schedule a call/meeting, or proposes times.
- Referral: redirects to a different person or department as the right contact ("you should reach out to X instead").
- Not now: polite deferral without a firm no ("not a priority right now", "check back next quarter").
- Not interested: a clear no, not a deferral.
- Unsubscribe: asks to be removed from the list / stop emailing / opts out. Use this ONLY when the reply is actually asking to stop receiving email -- this label triggers an automatic compliance suppression, so never guess it from a merely negative or annoyed tone; only from an actual opt-out/removal request.
- Out of office: an automated or auto-reply-style away message (vacation, parental leave, "I'm out until...").
- Wrong contact: says this isn't the right person/role at all, without naming a specific referral (distinct from Referral, which names who to contact instead).
- Pricing question: the reply's main ask is about cost/pricing.
- Partnership question: asks about a partnership/integration/reseller arrangement rather than being a direct prospect.

If more than one could apply, pick the single label that best captures the reply's primary intent. Always answer with one label from the list above, exactly as spelled there.`

/** The sender's address isn't needed to classify, so it isn't sent to the LLM. Callers
 * pass the body already cleaned by cleanReplyText (signature/quote stripped, contact
 * details redacted). */
export function replyClassificationUserMessage(reply: {
  subject: string | null
  body: string | null
}): string {
  return `SUBJECT: ${reply.subject ?? '(no subject)'}
BODY:
${reply.body ?? '(no body)'}`
}

const NORMALIZED_LOOKUP = new Map<string, ReplyClass>(
  REPLY_CLASSES.map((c) => [c.toLowerCase(), c]),
)

/** Maps a raw LLM response to one of the 10 canonical classes, or null if it doesn't
 * match any of them (trimmed/case-insensitive, with a trailing period tolerated -- the
 * one bit of real-world LLM sloppiness worth shrugging off). Never guesses a class the
 * model didn't actually say. */
export function normalizeReplyClass(raw: string): ReplyClass | null {
  const cleaned = raw.trim().replace(/[.\s]+$/, '')
  return NORMALIZED_LOOKUP.get(cleaned.toLowerCase()) ?? null
}

// --- Job seekers (b2c) ----------------------------------------------------------------

export const B2C_REPLY_CLASSES = [
  'interested',
  'role_request',
  'pricing',
  'assistance',
  'not_now',
  'not_interested',
  'already_employed',
  'unsubscribe',
  'out_of_office',
  'other',
] as const

export type B2cReplyClass = (typeof B2C_REPLY_CLASSES)[number]
export type AnyReplyClass = ReplyClass | B2cReplyClass
export type ReplyAudience = 'b2b' | 'b2c'

export const B2C_REPLY_CLASSIFICATION_SYSTEM = `You classify one email reply from a job seeker to an email from Job-Hopper (job-hopper.io, a job-matching service for job seekers). Answer with EXACTLY ONE of these labels, verbatim, and nothing else -- no punctuation, no explanation:

${B2C_REPLY_CLASSES.map((c) => `- ${c}`).join('\n')}

Definitions:
- interested: positive, wants to use Job-Hopper or hear more, without a more specific ask below.
- role_request: asks for specific jobs or roles (a title, field, location, remote, sponsorship-friendly roles).
- pricing: the main ask is about cost, plans, billing, discounts or refunds.
- assistance: needs help using the product: login, account, resume upload, matches, profile, a bug.
- not_now: polite deferral without a firm no ("maybe later", "busy this month").
- not_interested: a clear no, without saying they found a job.
- already_employed: says they've found a job or are no longer looking.
- unsubscribe: asks to stop receiving emails or be removed. Use this ONLY for an actual opt-out request -- it triggers an automatic suppression -- never from a merely negative tone.
- out_of_office: an automatic away message.
- other: anything else.

If more than one could apply, pick the one that best captures the reply's primary intent.`

const B2C_LOOKUP = new Map<string, B2cReplyClass>(B2C_REPLY_CLASSES.map((c) => [c, c]))

/** Maps a raw LLM response to a b2c class, or null. Tolerates case, surrounding quotes,
 * a trailing period and spaces/hyphens instead of underscores. */
export function normalizeB2cReplyClass(raw: string): B2cReplyClass | null {
  const cleaned = raw.trim().replace(/^["'`]+|["'`.\s]+$/g, '').toLowerCase().replace(/[\s-]+/g, '_')
  return B2C_LOOKUP.get(cleaned) ?? null
}

/** A lead match means a B2B conversation, even if the same address is also a prospect.
 * Unmatched senders keep the original (b2b) prompt. */
export function replyAudience(reply: { institutional_lead_id: string | null; prospect_id: string | null; profile_id: string | null }): ReplyAudience {
  if (reply.institutional_lead_id) return 'b2b'
  return reply.prospect_id || reply.profile_id ? 'b2c' : 'b2b'
}

export function classificationPrompt(audience: ReplyAudience): { system: string; normalize: (raw: string) => AnyReplyClass | null } {
  return audience === 'b2c'
    ? { system: B2C_REPLY_CLASSIFICATION_SYSTEM, normalize: normalizeB2cReplyClass }
    : { system: REPLY_CLASSIFICATION_SYSTEM, normalize: normalizeReplyClass }
}

/** Both class sets' opt-out label. */
export const isUnsubscribeClass = (c: string | null) => c === 'Unsubscribe' || c === 'unsubscribe'
