/**
 * Mailtrap Sending webhook handling (mailtrap-bounce-webhook). Kept here so tests can
 * drive it without starting a server.
 *
 * Payload: { events: [{ event, email, message_id, event_id?, bounce_category?, ... }] },
 * signed with HMAC-SHA256 of the raw body in the Mailtrap-Signature header.
 * Event names (per Mailtrap): delivery, open, click, unsubscribe, spam, soft bounce,
 * bounce, suspension, reject. Mapped to suppressed_emails, for any address:
 *   bounce      -> hard_bounce,    scope all   (+ institutional_leads.status = 'bounced')
 *   spam        -> spam_complaint, scope all
 *   unsubscribe -> unsubscribe,    scope marketing
 * Everything else (including soft bounces) is ignored for now.
 *
 * Separately, delivery / bounce / spam update the matching email_events row (by
 * message_id) to delivered / bounced / complained with a timestamp, via
 * record_email_delivery_event(). "delivery" is handled ONLY for this -- it never writes
 * suppressed_emails. An unknown message_id (e.g. an email sent before the send log
 * existed) matches no row and is not an error.
 */

export interface MailtrapEvent {
  event?: unknown
  email?: unknown
  message_id?: unknown
  event_id?: unknown
  timestamp?: unknown
}

export type SuppressionReason = "hard_bounce" | "spam_complaint" | "unsubscribe"

export interface SuppressionWrite {
  email: string // trimmed + lowercased; suppress_email() normalizes again
  reason: SuppressionReason
  scope: "all" | "marketing"
  providerEventId: string | null
}

const EVENT_MAP: Record<string, { reason: SuppressionReason; scope: "all" | "marketing" }> = {
  bounce: { reason: "hard_bounce", scope: "all" },
  spam: { reason: "spam_complaint", scope: "all" },
  unsubscribe: { reason: "unsubscribe", scope: "marketing" },
}

/** One write per (address, reason); events without a usable address or with an unmapped name are dropped. */
export function suppressionsFromEvents(events: MailtrapEvent[]): SuppressionWrite[] {
  const byKey = new Map<string, SuppressionWrite>()
  for (const e of events) {
    if (typeof e.event !== "string" || typeof e.email !== "string") continue
    const mapped = EVENT_MAP[e.event]
    const email = e.email.trim().toLowerCase()
    if (!mapped || !email.includes("@")) continue
    const key = `${email}|${mapped.reason}`
    if (byKey.has(key)) continue
    byKey.set(key, {
      email,
      ...mapped,
      providerEventId: typeof e.event_id === "string" ? e.event_id : typeof e.message_id === "string" ? e.message_id : null,
    })
  }
  return [...byKey.values()]
}

export type DeliveryStatus = "delivered" | "bounced" | "complained"

export interface DeliveryUpdate {
  messageId: string
  status: DeliveryStatus
  at: string | null // ISO; null = let the DB use now()
}

const STATUS_MAP: Record<string, DeliveryStatus> = {
  delivery: "delivered",
  bounce: "bounced",
  spam: "complained",
}

/** One update per (message_id, status). `timestamp` is read as Unix seconds when numeric. */
export function deliveryUpdatesFromEvents(events: MailtrapEvent[]): DeliveryUpdate[] {
  const byKey = new Map<string, DeliveryUpdate>()
  for (const e of events) {
    if (typeof e.event !== "string" || typeof e.message_id !== "string" || !e.message_id) continue
    const status = STATUS_MAP[e.event]
    if (!status) continue
    const key = `${e.message_id}|${status}`
    if (byKey.has(key)) continue
    const at = typeof e.timestamp === "number" && Number.isFinite(e.timestamp) ? new Date(e.timestamp * 1000).toISOString() : null
    byKey.set(key, { messageId: e.message_id, status, at })
  }
  return [...byKey.values()]
}

export async function verifyMailtrapSignature(rawBody: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ])
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody))
  const computed = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("")
  const provided = signatureHeader.trim().toLowerCase()
  if (computed.length !== provided.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ provided.charCodeAt(i)
  return diff === 0
}

export interface MailtrapWebhookDeps {
  secret: string | undefined
  /** suppress_email RPC. Idempotent, so Mailtrap retrying a batch is safe. */
  suppress: (write: SuppressionWrite) => Promise<void>
  /** Existing behaviour: institutional_leads.status = 'bounced' for a hard-bounced contact. */
  flagBouncedLead: (email: string) => Promise<void>
  /** record_email_delivery_event RPC. Resolves to the number of email_events rows matched (0 = unknown message id). */
  recordDelivery: (update: DeliveryUpdate) => Promise<number>
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mailtrap-signature",
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

export function createMailtrapWebhookHandler(deps: MailtrapWebhookDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

    if (!deps.secret) {
      console.error("mailtrap-bounce-webhook: MAILTRAP_WEBHOOK_SECRET is not configured; rejecting")
      return json({ error: "Webhook not configured" }, 401)
    }

    const rawBody = await req.text()
    if (!(await verifyMailtrapSignature(rawBody, req.headers.get("Mailtrap-Signature"), deps.secret))) {
      console.error("mailtrap-bounce-webhook: invalid or missing signature")
      return json({ error: "Invalid signature" }, 401)
    }

    let events: MailtrapEvent[]
    try {
      const body = JSON.parse(rawBody) as { events?: unknown }
      events = Array.isArray(body.events) ? (body.events as MailtrapEvent[]) : []
    } catch {
      return json({ error: "Invalid JSON body" }, 400)
    }

    const writes = suppressionsFromEvents(events)
    let suppressFailed = 0
    for (const write of writes) {
      try {
        await deps.suppress(write)
      } catch (err) {
        suppressFailed += 1
        console.error("mailtrap-bounce-webhook: failed to suppress address", {
          emailDomain: write.email.split("@")[1] ?? null,
          reason: write.reason,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      if (write.reason === "hard_bounce") {
        try {
          await deps.flagBouncedLead(write.email)
        } catch (err) {
          // Best-effort, as before: the suppression row is what stops future sends.
          console.error("mailtrap-bounce-webhook: failed to flag bounced lead", {
            emailDomain: write.email.split("@")[1] ?? null,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    const updates = deliveryUpdatesFromEvents(events)
    let statusUpdated = 0
    let deliveryFailed = 0
    let unknownMessages = 0
    for (const update of updates) {
      try {
        const matched = await deps.recordDelivery(update)
        if (matched > 0) statusUpdated += 1
        else unknownMessages += 1
      } catch (err) {
        deliveryFailed += 1
        console.error("mailtrap-bounce-webhook: failed to record delivery event", {
          status: update.status,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const counts = {
      received: events.length,
      suppressed: writes.length - suppressFailed,
      failed: suppressFailed + deliveryFailed,
      bounced: writes.filter((w) => w.reason === "hard_bounce").length,
      statusUpdated,
      unknownMessages,
    }
    // A failed suppression or delivery write returns 500 so Mailtrap redelivers the batch
    // (it retries non-2xx responses); every write here is idempotent (suppress_email
    // dedupes, record_email_delivery_event keeps the first timestamp and only moves status
    // forward), so a redelivery is harmless. An unknown message id is not a failure.
    return json(counts, suppressFailed + deliveryFailed > 0 ? 500 : 200)
  }
}
