/**
 * Public email API for Edge Functions. Uses the provider-agnostic sendEmailViaProvider.
 * Callers pass profileId/type/templateKey for email_events logging; the actual send
 * is delegated to _shared/email-provider.ts (stub or real SMTP/API).
 */

import type { SendEmailResult } from "./email-provider.ts"
import { sendEmailViaProvider } from "./email-provider.ts"

export type { SendEmailResult }

export interface SendEmailOptions {
  to: string
  subject: string
  text?: string
  html?: string
  category?: string
  metadata?: Record<string, unknown>
  /** For email_events logging */
  profileId?: string | null
  eventType?: "job_match_digest" | "subscription_update" | "system_announcement"
  templateKey?: string | null
  payload?: Record<string, unknown> | null
  /** Supabase client (service_role) to insert into email_events. If omitted, no DB log. */
  supabase?: { from: (table: string) => { insert: (row: unknown) => Promise<{ error: unknown }> } }
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const result = await sendEmailViaProvider({
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    category: options.category,
    metadata: options.metadata,
  })

  if (options.supabase && options.profileId != null && options.eventType) {
    const status = result.success ? "sent" : "failed"
    try {
      const { error } = await options.supabase.from("email_events").insert({
        profile_id: options.profileId,
        type: options.eventType,
        subject: options.subject,
        template_key: options.templateKey ?? null,
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
