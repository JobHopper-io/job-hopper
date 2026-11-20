/**
 * Public email API for Edge Functions. Uses the provider-agnostic sendEmailViaProvider.
 * Callers pass profileId/type/templateKey for email_events logging; the actual send
 * is delegated to _shared/email-provider.ts (stub or real SMTP/API).
 *
 * Every send is checked against suppressed_emails (is_email_suppressed RPC) first.
 * If the check itself fails, marketing is blocked and transactional still sends.
 */

import type { SendEmailResult } from "./email-provider.ts"
import { sendEmailViaProvider } from "./email-provider.ts"
import { isValidUnsubscribeUrl, normalizeEmail } from "./unsubscribe-token.ts"

export type { SendEmailResult }

/** transactional: billing, account, and alerts the user set up. marketing: anything promotional or broadcast. */
export type EmailKind = "transactional" | "marketing"

/** Resolves true when the address must not receive this kind of email; throws when it can't tell. */
export type SuppressionCheck = (email: string, kind: EmailKind) => Promise<boolean>

export const isEmailSuppressed: SuppressionCheck = async (email, kind) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
  }
  const resp = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/is_email_suppressed`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_email: email, p_kind: kind }),
    signal: AbortSignal.timeout(5_000),
  })
  const body = await resp.text()
  if (!resp.ok) throw new Error(`is_email_suppressed ${resp.status}: ${body.slice(0, 200)}`)
  const parsed = JSON.parse(body)
  if (typeof parsed !== "boolean") throw new Error(`is_email_suppressed returned ${body.slice(0, 200)}`)
  return parsed
}

export interface SendEmailOptions {
  kind: EmailKind
  /** The signed one-click link in this email's footer. Required for marketing: a marketing send without a valid one is refused. */
  unsubscribeUrl?: string | null
  to: string
  subject: string
  text?: string
  html?: string
  category?: string
  metadata?: Record<string, unknown>
  /** For email_events logging */
  profileId?: string | null
  eventType?:
    | "job_match_digest"
    | "subscription_update"
    | "system_announcement"
    | "sponsor_watch_alert"
    | "reveal_request_received"
  templateKey?: string | null
  /** Campaign tag stored on the email_events row (growth sends). */
  campaign?: string | null
  payload?: Record<string, unknown> | null
  /** Supabase client (service_role) to insert into email_events. If omitted, no DB log. */
  supabase?: { from: (table: string) => { insert: (row: unknown) => Promise<{ error: unknown }> } }
}

/** RFC 2369 + RFC 8058 one-click unsubscribe headers. The URL is the same signed
 * unsubscribe-email link as the footer; its POST handler accepts the one-click body. */
export function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

/** Test seams; production callers never pass this. */
export interface SendEmailDeps {
  isSuppressed?: SuppressionCheck
  send?: typeof sendEmailViaProvider
}

export async function sendEmail(options: SendEmailOptions, deps: SendEmailDeps = {}): Promise<SendEmailResult> {
  const isSuppressed = deps.isSuppressed ?? isEmailSuppressed
  const send = deps.send ?? sendEmailViaProvider
  const toDomain = options.to.split("@")[1] ?? null

  let blockedReason: string | null =
    options.kind === "marketing" && !isValidUnsubscribeUrl(options.unsubscribeUrl)
      ? "marketing email has no valid unsubscribe link"
      : null
  if (!blockedReason) {
    try {
      if (await isSuppressed(options.to, options.kind)) blockedReason = "address is suppressed"
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (options.kind === "marketing") {
        blockedReason = `suppression check failed: ${message}`
        console.error("[email] suppression check failed; blocking marketing send", { toDomain, error: message })
      } else {
        console.error("[email] suppression check failed; sending transactional anyway", { toDomain, error: message })
      }
    }
  }

  if (blockedReason) {
    console.log("[email] send blocked", { toDomain, kind: options.kind, category: options.category, reason: blockedReason })
  }

  const result: SendEmailResult = blockedReason
    ? { messageId: null, success: false, error: `Not sent: ${blockedReason}` }
    : await send({
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      category: options.category,
      metadata: options.metadata,
      headers: options.kind === "marketing" ? listUnsubscribeHeaders(options.unsubscribeUrl!) : undefined,
    })

  if (options.supabase && options.profileId != null && options.eventType) {
    const status = result.success ? "sent" : "failed"
    try {
      const { error } = await options.supabase.from("email_events").insert({
        profile_id: options.profileId,
        type: options.eventType,
        subject: options.subject,
        template_key: options.templateKey ?? null,
        to_email_normalized: normalizeEmail(options.to) || null,
        campaign: options.campaign ?? null,
        payload: options.payload ?? null,
        provider_message_id: result.messageId,
        status,
        error_message: result.error ?? null,
      })

      if (error) {
        console.error("[email] failed to insert email_events row", {
          profileId: options.profileId,
          eventType: options.eventType,
          status,
          error,
        })
      }
    } catch (err) {
      console.error("[email] unexpected error inserting email_events row", {
        profileId: options.profileId,
        eventType: options.eventType,
        status,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
