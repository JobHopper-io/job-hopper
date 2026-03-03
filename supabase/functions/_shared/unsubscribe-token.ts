/**
 * Create a signed token for one-click unsubscribe links.
 * Verify with the same secret in unsubscribe-email edge function.
 */
import { encodeBase64Url } from "https://deno.land/std@0.168.0/encoding/base64url.ts"

const DEFAULT_EXP_SECONDS = 60 * 60 * 24 * 365 // 1 year

export async function createUnsubscribeToken(
  profileId: string,
  secret: string,
  expInSeconds: number = DEFAULT_EXP_SECONDS
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expInSeconds
  const payload = { profile_id: profileId, scope: "all", exp }
  const payloadStr = JSON.stringify(payload)
  const payloadB64 = encodeBase64Url(new TextEncoder().encode(payloadStr))
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64)
  )
  const sigB64 = encodeBase64Url(new Uint8Array(sig))
  return `${payloadB64}.${sigB64}`
}

export function getUnsubscribeUrl(profileId: string, functionsUrl: string, token: string): string {
  return `${functionsUrl}/unsubscribe-email?token=${encodeURIComponent(token)}`
}

/**
 * Resolve footer links for email templates (preferences + one-click unsubscribe).
 * Reads SITE_URL, SUPABASE_URL, UNSUBSCRIBE_EMAIL_SECRET; returns tokenized unsubscribe URL
 * when secret is set, otherwise fallback to profile page. Try/catch is internal.
 */
export async function getFooterLinksForProfile(profileId: string): Promise<{
  preferencesUrl: string
  unsubscribeUrl: string
  siteUrl: string
}> {
  const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173"
  const preferencesUrl = `${siteUrl}/profile`
  let unsubscribeUrl = `${siteUrl}/profile?unsubscribe=1`
  const secret = Deno.env.get("UNSUBSCRIBE_EMAIL_SECRET")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  if (secret && supabaseUrl) {
    try {
      const token = await createUnsubscribeToken(profileId, secret)
      unsubscribeUrl = getUnsubscribeUrl(profileId, `${supabaseUrl}/functions/v1`, token)
    } catch {
      // keep fallback
    }
  }
  return { preferencesUrl, unsubscribeUrl, siteUrl }
}
