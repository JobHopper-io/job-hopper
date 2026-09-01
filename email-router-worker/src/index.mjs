import PostalMime from "postal-mime";

// Cloudflare Email Worker for job-hopper.co Email Routing.
// Receives an inbound email, parses sender / subject / body, and POSTs it to the
// reply-ingest Supabase edge function (same JSON + x-reply-ingest-secret contract
// as supabase/functions/reply-ingest/index.ts).

// Header "From:" is the human address that should match
// institutional_leads.contact_email; fall back to the SMTP envelope sender.
export function buildPayload(parsed, message) {
  return {
    fromEmail: parsed.from?.address || message.from,
    subject: parsed.subject ?? message.headers.get("subject") ?? "",
    body: parsed.text ?? parsed.html ?? "",
    receivedAt: new Date().toISOString(),
  };
}

export default {
  async email(message, env) {
    const parsed = await PostalMime.parse(message.raw);
    const payload = buildPayload(parsed, message);

    const res = await fetch(env.REPLY_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-reply-ingest-secret": env.REPLY_INGEST_SECRET,
      },
      body: JSON.stringify(payload),
    });

    // Throw on failure so Cloudflare marks the message failed and retries it,
    // instead of silently dropping a partner reply.
    if (!res.ok) {
      throw new Error(`reply-ingest ${res.status}: ${await res.text()}`);
    }
  },
};
