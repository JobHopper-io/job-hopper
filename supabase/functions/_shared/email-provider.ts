/**
 * Email provider abstraction: stable interface for sending email.
 * Swap the implementation here (stub vs SMTP vs HTTP API) without changing callers.
 */

export interface SendEmailParams {
  to: string
  subject: string
  text?: string
  html?: string
  category?: string
  metadata?: Record<string, unknown>
}

export interface SendEmailResult {
  messageId: string | null
  success: boolean
  error?: string
}

/**
 * Stub implementation: logs the payload and returns a synthetic messageId.
 * No real email is sent. Replace this with an SMTP or HTTP API implementation
 * when a provider is chosen (see plan: SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM
 * or RESEND_API_KEY etc.).
 */
export async function sendEmailViaProvider(params: SendEmailParams): Promise<SendEmailResult> {
  console.log("[email-provider] stub send", {
    to: params.to,
    subject: params.subject,
    category: params.category,
    hasHtml: !!params.html,
    hasText: !!params.text,
  })
  return {
    messageId: `stub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    success: true,
  }
}
