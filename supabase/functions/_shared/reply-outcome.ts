/**
 * What classify-replies does with one reply once the LLM has labelled it. Kept here so
 * the ordering is testable without a server or an LLM.
 *
 * An Unsubscribe suppresses the sender's address (suppressed_emails, scope marketing,
 * source classify-replies) FIRST, for every reply, matched to a lead or not. If that
 * write fails, the reply is left unprocessed so the next sweep retries it -- an opt-out
 * must not be lost. Then, as before: mark processed, and for a reply matched to a lead,
 * add the lead's organization to exclusion_lists.
 */

export interface ReplyOutcomeDeps {
  suppressSender: (fromEmail: string) => Promise<void>
  markClassified: (replyId: string, replyClass: string | null) => Promise<void>
  /** Organization name for the lead, or null if the lead no longer exists. Throws on a DB error. */
  findLeadOrganization: (leadId: string) => Promise<string | null>
  excludeCompany: (organizationName: string) => Promise<void>
}

export interface ClassifiedReply {
  id: string
  institutional_lead_id: string | null
  from_email: string
}

export type ReplyOutcome =
  | "classified" // non-Unsubscribe, marked processed
  | "unsubscribed" // sender suppressed + company excluded
  | "unsubscribed_unmatched" // sender suppressed; no lead to exclude by company
  | "retry" // sender suppression failed; left unprocessed
  | "error" // a later step failed (sender suppression, if any, already done)

export async function recordClassifiedReply(
  deps: ReplyOutcomeDeps,
  reply: ClassifiedReply,
  replyClass: string | null,
): Promise<ReplyOutcome> {
  const isUnsubscribe = replyClass === "Unsubscribe"

  if (isUnsubscribe) {
    try {
      await deps.suppressSender(reply.from_email)
    } catch (err) {
      console.error("classify-replies: failed to suppress Unsubscribe sender; will retry", {
        replyEventId: reply.id,
        error: err instanceof Error ? err.message : String(err),
      })
      return "retry"
    }
  }

  try {
    await deps.markClassified(reply.id, replyClass)
  } catch (err) {
    console.error("classify-replies: failed to write reply_class", { replyEventId: reply.id, error: String(err) })
    return "error"
  }

  if (!isUnsubscribe) return "classified"

  if (!reply.institutional_lead_id) {
    console.warn("classify-replies: Unsubscribe reply has no matched lead; sender suppressed, no company exclusion", {
      replyEventId: reply.id,
    })
    return "unsubscribed_unmatched"
  }

  try {
    const organizationName = await deps.findLeadOrganization(reply.institutional_lead_id)
    if (!organizationName) {
      console.error("classify-replies: lead for Unsubscribe reply not found", { replyEventId: reply.id })
      return "error"
    }
    await deps.excludeCompany(organizationName)
  } catch (err) {
    console.error("classify-replies: failed to add company to exclusion_lists", {
      replyEventId: reply.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return "error"
  }
  return "unsubscribed"
}
