/**
 * Email provider abstraction: stable interface for sending email.
 * This implementation uses the Mailtrap Email Sending HTTP API.
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

const DEFAULT_MAILTRAP_BASE_URL = 'https://send.api.mailtrap.io'

export async function sendEmailViaProvider(params: SendEmailParams): Promise<SendEmailResult> {
  const apiToken = Deno.env.get('MAILTRAP_API_TOKEN') ?? ''
  const baseUrl = (Deno.env.get('MAILTRAP_BASE_URL') ?? DEFAULT_MAILTRAP_BASE_URL).replace(/\/+$/, '')
  const fromEnv = Deno.env.get('MAILTRAP_FROM') ?? ''

  if (!apiToken) {
    const missing = []
    if (!apiToken) missing.push('MAILTRAP_API_TOKEN')
    const error = `Mailtrap configuration missing: ${missing.join(', ')}`
    console.error('[email-provider] send failed –', error)
    return {
      messageId: null,
      success: false,
      error,
    }
  }

  const fromAddress =
    fromEnv.trim() ||
    'Job-Hopper <no-reply@mailtrap.io>'

  const url = `${baseUrl.replace(/\/+$/, '')}/api/send`

  console.log('[email-provider] Mailtrap send attempt', {
    to: params.to,
    category: params.category,
    url,
  })

  const toAddress = params.to.trim()

  const payload: Record<string, unknown> = {
    from: fromAddress,
    to: [toAddress],
    subject: params.subject,
  }

  if (params.html) {
    payload.html = params.html
  }
  if (params.text) {
    payload.text = params.text
  }

  if (params.category) {
    payload.category = params.category
  }

  if (params.metadata && Object.keys(params.metadata).length > 0) {
    payload.custom_variables = params.metadata
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Api-Token': apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
        if (parsed && typeof parsed.message_id === 'string') {
          messageId = parsed.message_id
        }
      } catch {
        // Non-JSON or unexpected; leave messageId as null
      }
      console.log('[email-provider] Mailtrap send ok', {
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
    error = `Mailtrap error ${resp.status}: ${truncatedBody || resp.statusText}`
    console.error('[email-provider] Mailtrap send failed', {
      to: params.to,
      category: params.category,
      status: resp.status,
      url,
      body: truncatedBody,
    })

    return {
      messageId: null,
      success: false,
      error,
    }
  } catch (err) {
    const error =
      err instanceof Error ? `Mailtrap request failed: ${err.message}` : 'Mailtrap request failed'
    console.error('[email-provider] Mailtrap send threw', {
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
