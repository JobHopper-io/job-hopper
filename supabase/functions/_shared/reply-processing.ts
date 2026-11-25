/**
 * classify-replies' per-reply pipeline, kept here so it's testable with a mocked LLM.
 *
 *   1. audience by who the reply matched (lead -> b2b; prospect/profile -> b2c)
 *   2. clean the text (quotes, signature, contact details) before any LLM call
 *   3. classify with that audience's prompt; a failure (LLM error or unknown label) leaves
 *      the reply unprocessed and counts an attempt; after MAX_CLASSIFY_ATTEMPTS it's
 *      flagged needs_manual_review and no longer picked up
 *   4. unsubscribe: suppress the sender FIRST (existing path); if that fails, retry next
 *      sweep without counting an attempt, so an opt-out is never dropped
 *   5. extraction and a draft (drafts are never sent; guardDraft enforces the rules)
 *   6. write the class back to the lead (reply_class, status replied) and prospect
 *      (status replied); a lead's unsubscribe also excludes the company
 *   7. only then mark the reply processed, with owner and next action
 *
 * Steps 4 and 6 are idempotent, so a retry after a later failure is safe.
 */
import type { ChatMessage } from './llm.ts'
import {
  type AnyReplyClass,
  classificationPrompt,
  isUnsubscribeClass,
  type ReplyAudience,
  replyAudience,
  replyClassificationUserMessage,
} from './reply-classification-prompt.ts'
import {
  cleanReplyText,
  draftSystemPrompt,
  EXTRACTION_SYSTEM,
  guardDraft,
  needsDraft,
  nextActionFor,
  parseExtraction,
  type ReplyExtraction,
} from './reply-assist.ts'

export const MAX_CLASSIFY_ATTEMPTS = 3

export interface ReplyRow {
  id: string
  institutional_lead_id: string | null
  prospect_id: string | null
  profile_id: string | null
  from_email: string
  raw_subject: string | null
  raw_body: string | null
  received_at: string
  classify_attempts: number
}

export interface ProcessedPatch {
  reply_class: AnyReplyClass
  audience: ReplyAudience
  processed: true
  extracted: ReplyExtraction | null
  draft_response: string | null
  draft_generated_at: string | null
  next_action: string | null
  next_action_due: string | null
  assigned_to: string | null
  classify_attempts: number
  last_classify_error: null
  needs_manual_review: false
}

export interface ReplyProcessingDeps {
  llm: (messages: ChatMessage[], purpose: 'classify' | 'extract' | 'draft') => Promise<{ ok: true; content: string } | { ok: false; error: string }>
  suppressSender: (fromEmail: string) => Promise<void>
  findLeadOrganization: (leadId: string) => Promise<string | null>
  excludeCompany: (organizationName: string) => Promise<void>
  /** reply_class on the lead; status -> 'replied' unless it's already past contacted. */
  markLeadReplied: (leadId: string, replyClass: AnyReplyClass) => Promise<void>
  /** status -> 'replied' unless it's already past contacted. */
  markProspectReplied: (prospectId: string) => Promise<void>
  /** Writes the patch only while the row is still unprocessed (safe to re-run). */
  saveProcessed: (replyId: string, patch: ProcessedPatch) => Promise<void>
  recordFailure: (replyId: string, attempts: number, error: string, needsManualReview: boolean) => Promise<void>
  defaultOwner: string | null
  siteUrl: string
  now: () => Date
}

export type ReplyProcessingOutcome =
  | { status: 'processed'; replyClass: AnyReplyClass; audience: ReplyAudience; unsubscribed: boolean; companyExcluded: boolean; draftFallback: boolean }
  | { status: 'retry'; error: string; attempts: number }
  | { status: 'manual_review'; error: string; attempts: number }
  | { status: 'suppression_retry'; error: string }

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

async function fail(deps: ReplyProcessingDeps, reply: ReplyRow, error: string): Promise<ReplyProcessingOutcome> {
  const attempts = reply.classify_attempts + 1
  const manual = attempts >= MAX_CLASSIFY_ATTEMPTS
  await deps.recordFailure(reply.id, attempts, error.slice(0, 500), manual)
  return manual ? { status: 'manual_review', error, attempts } : { status: 'retry', error, attempts }
}

export async function processReply(deps: ReplyProcessingDeps, reply: ReplyRow): Promise<ReplyProcessingOutcome> {
  const audience = replyAudience(reply)
  const text = cleanReplyText(reply.raw_body)
  const userMessage = replyClassificationUserMessage({ subject: reply.raw_subject, body: text })

  // 3. classify
  const prompt = classificationPrompt(audience)
  const classified = await deps.llm([{ role: 'system', content: prompt.system }, { role: 'user', content: userMessage }], 'classify')
  if (!classified.ok) return fail(deps, reply, `classification failed: ${classified.error}`)
  const replyClass = prompt.normalize(classified.content)
  if (!replyClass) return fail(deps, reply, `unrecognized class: ${classified.content.slice(0, 80)}`)
  const unsubscribe = isUnsubscribeClass(replyClass)

  // 4. opt-out first
  if (unsubscribe) {
    try {
      await deps.suppressSender(reply.from_email)
    } catch (err) {
      console.error('classify-replies: failed to suppress unsubscribe sender; will retry', { replyEventId: reply.id, error: message(err) })
      return { status: 'suppression_retry', error: message(err) }
    }
  }

  // 5. extraction + draft (best effort: a failure here leaves them null / the fallback)
  let extracted: ReplyExtraction | null = null
  if (!unsubscribe) {
    const r = await deps.llm([{ role: 'system', content: EXTRACTION_SYSTEM }, { role: 'user', content: userMessage }], 'extract')
    extracted = r.ok ? parseExtraction(r.content) : null
  }
  let draft: string | null = null
  let draftFallback = false
  if (needsDraft(replyClass)) {
    const r = await deps.llm([
      { role: 'system', content: draftSystemPrompt(audience, deps.siteUrl) },
      { role: 'user', content: `Reply class: ${replyClass}\n${extracted?.need ? `Their need: ${extracted.need}\n` : ''}${extracted?.question ? `Their question: ${extracted.question}\n` : ''}\n${userMessage}` },
    ], 'draft')
    const guarded = guardDraft(r.ok ? r.content : null, replyClass, deps.siteUrl)
    draft = guarded.draft
    draftFallback = guarded.usedFallback
    if (guarded.problems.length) console.warn('classify-replies: draft broke a rule; used the fallback', { replyEventId: reply.id, problems: guarded.problems })
  }

  // 6. write-back (idempotent)
  let companyExcluded = false
  try {
    if (reply.institutional_lead_id) {
      await deps.markLeadReplied(reply.institutional_lead_id, replyClass)
      if (unsubscribe) {
        const org = await deps.findLeadOrganization(reply.institutional_lead_id)
        if (org) {
          await deps.excludeCompany(org)
          companyExcluded = true
        }
      }
    }
    if (reply.prospect_id) await deps.markProspectReplied(reply.prospect_id)
  } catch (err) {
    return fail(deps, reply, `write-back failed: ${message(err)}`)
  }

  // 7. done
  const now = deps.now().toISOString()
  const action = nextActionFor(replyClass, reply.received_at)
  try {
    await deps.saveProcessed(reply.id, {
      reply_class: replyClass,
      audience,
      processed: true,
      extracted,
      draft_response: draft,
      draft_generated_at: draft ? now : null,
      ...action,
      assigned_to: action.next_action ? deps.defaultOwner : null,
      classify_attempts: reply.classify_attempts + 1,
      last_classify_error: null,
      needs_manual_review: false,
    })
  } catch (err) {
    return fail(deps, reply, `save failed: ${message(err)}`)
  }
  return { status: 'processed', replyClass, audience, unsubscribed: unsubscribe, companyExcluded, draftFallback }
}
