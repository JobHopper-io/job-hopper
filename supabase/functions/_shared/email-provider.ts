/**
 * Email provider abstraction: stable interface for sending email.
 * This implementation uses the Mailgun HTTP API (v3 messages endpoint).
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

const DEFAULT_MAILGUN_BASE_URL = 'https://api.mailgun.net/v3'

export async function sendEmailViaProvider(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('MAILGUN_API_KEY') ?? ''
  const domain = Deno.env.get('MAILGUN_DOMAIN') ?? ''
  const baseUrl = (Deno.env.get('MAILGUN_BASE_URL') ?? DEFAULT_MAILGUN_BASE_URL).replace(/\/+$/, '')
  const fromEnv = Deno.env.get('MAILGUN_FROM') ?? ''

  if (!apiKey || !domain) {
    const missing = []
    if (!apiKey) missing.push('MAILGUN_API_KEY')
    if (!domain) missing.push('MAILGUN_DOMAIN')
    const error = `Mailgun configuration missing: ${missing.join(', ')}`
    console.error('[email-provider] send failed –', error)
    return {
      messageId: null,
      success: false,
      error,
    }
  }

  const from =
    fromEnv.trim() ||
    `Job-Hopper <no-reply@${domain}>`

  const url = `${baseUrl}/${encodeURIComponent(domain)}/messages`

  const form = new URLSearchParams()
  form.set('from', from)
  form.set('to', params.to)
  form.set('subject', params.subject)
  if (params.html) {
    form.set('html', params.html)
  }
  if (params.text) {
    form.set('text', params.text)
  }

  // Optional tag/category and metadata
  if (params.category) {
    form.append('o:tag', params.category)
  }

  if (params.metadata) {
    for (const [key, value] of Object.entries(params.metadata)) {
      try {
        form.append(`v:${key}`, JSON.stringify(value))
      } catch {
        // If value is not serializable, fall back to string
        form.append(`v:${key}`, String(value))
      }
    }
  }

  const authHeader = 'Basic ' + btoa(`api:${apiKey}`)

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })

    let messageId: string | null = null
    let error: string | undefined

    let bodyText = ''
    try {
      bodyText = await resp.text()
    } catch {
      // ignore
    }

    if (resp.ok) {
      try {
        const parsed = bodyText ? JSON.parse(bodyText) : null
        if (parsed && typeof parsed.id === 'string') {
          messageId = parsed.id
        }
      } catch {
        // Non-JSON or unexpected; leave messageId as null
      }
      console.log('[email-provider] Mailgun send ok', {
        to: params.to,
        category: params.category,
        messageId,
        status: resp.status,
      })
      return {
        messageId,
        success: true,
      }
    }

    const truncatedBody = bodyText.length > 500 ? `${bodyText.slice(0, 500)}…` : bodyText
    error = `Mailgun error ${resp.status}: ${truncatedBody || resp.statusText}`
    console.error('[email-provider] Mailgun send failed', {
      to: params.to,
      category: params.category,
      status: resp.status,
      body: truncatedBody,
    })

    return {
      messageId: null,
      success: false,
      error,
    }
  } catch (err) {
    const error =
      err instanceof Error ? `Mailgun request failed: ${err.message}` : 'Mailgun request failed'
    console.error('[email-provider] Mailgun send threw', {
      to: params.to,
      category: params.category,
      error,
    })
    return {
      messageId: null,
      success: false,
      error,
    }
  }
}
