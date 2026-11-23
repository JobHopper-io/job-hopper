/**
 * Signed unsubscribe tokens and email footer links.
 *
 * Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(payloadB64, UNSUBSCRIBE_EMAIL_SECRET)).
 * v2 payload: { v: 2, email_normalized, profile_id?, prospect_id?, scope, exp } -- keyed by
 * address so people without a profile (outbound prospects, preview recipients) can unsubscribe.
 * v1 payload (pre-2026-11): { profile_id, scope: "all", exp } -- still verified so old links work.
 * Verified by the unsubscribe-email edge function (_shared/unsubscribe-handler.ts).
 */

const DEFAULT_EXP_SECONDS = 60 * 60 * 24 * 365 // 1 year

export type UnsubscribeScope = "marketing" | "all"

export interface UnsubscribeTokenV1 {
  v: 1
  profile_id: string
  scope: "all"
  exp: number
}

export interface UnsubscribeTokenV2 {
  v: 2
  email_normalized: string
  profile_id?: string
  prospect_id?: string
  scope: UnsubscribeScope
  exp: number
}

export type VerifiedUnsubscribeToken = UnsubscribeTokenV1 | UnsubscribeTokenV2

/** Same rule as public.normalize_email(): lowercase, trim ASCII whitespace at both ends. */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, "")
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) {
    binary += String.fromCharCode(b)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

// Return type left inferred: newer TS types it Uint8Array<ArrayBuffer>, which
// crypto.subtle.verify requires; an explicit Uint8Array annotation would widen it.
function decodeBase64Url(value: string) {
  let base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  while (base64.length % 4 !== 0) base64 += "="
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    usage,
  ])
}

export async function createUnsubscribeToken(
  subject: { email: string; profileId?: string | null; prospectId?: string | null; scope: UnsubscribeScope },
  secret: string,
  expInSeconds: number = DEFAULT_EXP_SECONDS,
): Promise<string> {
  const emailNormalized = normalizeEmail(subject.email)
  if (!emailNormalized) throw new Error("createUnsubscribeToken: email is required")
  const payload: UnsubscribeTokenV2 = {
    v: 2,
    email_normalized: emailNormalized,
    ...(subject.profileId ? { profile_id: subject.profileId } : {}),
    ...(subject.prospectId ? { prospect_id: subject.prospectId } : {}),
    scope: subject.scope,
    exp: Math.floor(Date.now() / 1000) + expInSeconds,
  }
  const payloadB64 = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${encodeBase64Url(new Uint8Array(sig))}`
}

/** Returns the payload for a correctly signed, unexpired v1 or v2 token; null otherwise. */
export async function verifyUnsubscribeToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifiedUnsubscribeToken | null> {
  const dot = token.indexOf(".")
  if (dot <= 0 || dot === token.length - 1) return null
  const payloadB64 = token.slice(0, dot)
  try {
    const sigValid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, "verify"),
      decodeBase64Url(token.slice(dot + 1)),
      new TextEncoder().encode(payloadB64),
    )
    if (!sigValid) return null
    const raw = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadB64))) as Record<string, unknown>
    if (typeof raw.exp !== "number" || raw.exp < nowSeconds) return null

    if (raw.v === 2) {
      if (typeof raw.email_normalized !== "string" || !raw.email_normalized) return null
      if (raw.scope !== "marketing" && raw.scope !== "all") return null
      if (raw.profile_id !== undefined && typeof raw.profile_id !== "string") return null
      if (raw.prospect_id !== undefined && typeof raw.prospect_id !== "string") return null
      return raw as unknown as UnsubscribeTokenV2
    }
    if (raw.v === undefined && typeof raw.profile_id === "string" && raw.profile_id) {
      return { v: 1, profile_id: raw.profile_id, scope: "all", exp: raw.exp }
    }
    return null
  } catch {
    return null // malformed base64 / JSON
  }
}

export function getUnsubscribeUrl(functionsUrl: string, token: string): string {
  return `${functionsUrl}/unsubscribe-email?token=${encodeURIComponent(token)}`
}

/** True for a link to the unsubscribe-email function that carries a token -- what a
 * marketing send must have (sendEmail refuses marketing without one). */
export function isValidUnsubscribeUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.pathname.endsWith("/unsubscribe-email") &&
      !!parsed.searchParams.get("token")
  } catch {
    return false
  }
}

export interface FooterLinks {
  preferencesUrl: string
  unsubscribeUrl: string
  siteUrl: string
}

/**
 * Footer links with a signed one-click unsubscribe URL. Throws when UNSUBSCRIBE_EMAIL_SECRET
 * or SUPABASE_URL is missing -- there is no silent fallback link. profileId is optional
 * (preview recipients, outbound prospects). scope: "marketing" for marketing sends,
 * "all" for transactional ones (their footer link unsubscribes from everything, as before).
 */
export async function getFooterLinksForProfile(
  profileId: string | null,
  email: string,
  scope: UnsubscribeScope,
): Promise<FooterLinks> {
  const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173"
  const secret = Deno.env.get("UNSUBSCRIBE_EMAIL_SECRET")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  if (!secret || !supabaseUrl) {
    throw new Error("getFooterLinksForProfile: UNSUBSCRIBE_EMAIL_SECRET and SUPABASE_URL must be set")
  }
  const token = await createUnsubscribeToken({ email, profileId, scope }, secret)
  return {
    preferencesUrl: `${siteUrl}/profile`,
    unsubscribeUrl: getUnsubscribeUrl(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1`, token),
    siteUrl,
  }
}

/**
 * For transactional sends, which must still go out when unsubscribe links can't be signed:
 * same links as getFooterLinksForProfile(…, "all"), or, if that throws, the preferences
 * page in place of the unsubscribe link (logged loudly).
 */
export async function getTransactionalFooterLinks(profileId: string | null, email: string): Promise<FooterLinks> {
  try {
    return await getFooterLinksForProfile(profileId, email, "all")
  } catch (err) {
    console.error("[unsubscribe-token] cannot sign unsubscribe link; transactional footer uses preferences page", {
      error: err instanceof Error ? err.message : String(err),
    })
    const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173"
    return { preferencesUrl: `${siteUrl}/profile`, unsubscribeUrl: `${siteUrl}/profile`, siteUrl }
  }
}
