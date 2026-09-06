/** LLM prompt for classifying inbound replies to outbound institutional-lead emails
 * (reply_events.reply_class). Mirrors growth-summary-prompt.ts: one prompt/build pair,
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

export function replyClassificationUserMessage(reply: {
  fromEmail: string
  subject: string | null
  body: string | null
}): string {
  return `FROM: ${reply.fromEmail}
SUBJECT: ${reply.subject ?? '(no subject)'}
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
