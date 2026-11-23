// Unsubscribe link, footer and List-Unsubscribe headers for outbound emails
// (outbound-dry-run.mjs / outbound-live-send.mjs).
//
// Tokens are the same v2 format as supabase/functions/_shared/unsubscribe-token.ts
// (base64url JSON payload + "." + base64url HMAC-SHA256 over the payload, keyed with
// UNSUBSCRIBE_EMAIL_SECRET), so the unsubscribe-email function verifies them. That file
// is Deno TypeScript, so the signing is reimplemented here with node:crypto;
// supabase/functions/_shared/__tests__/outbound-unsubscribe.test.ts verifies tokens from
// this module with the real Deno verifier so the two can't drift.
// Only node: built-ins, so Deno can import this file too.

import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';

const DEFAULT_EXP_SECONDS = 60 * 60 * 24 * 365; // 1 year, same as the edge functions

/** Same rule as public.normalize_email(): lowercase, trim ASCII whitespace at both ends. */
export function normalizeEmail(email) {
  return email.toLowerCase().replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '');
}

/** v2 token for a cold-outbound recipient: scope 'marketing', keyed by address (no profile). */
export function createUnsubscribeToken(email, secret, { expInSeconds = DEFAULT_EXP_SECONDS, now = Date.now() } = {}) {
  const emailNormalized = normalizeEmail(email);
  if (!emailNormalized) throw new Error('createUnsubscribeToken: email is required');
  const payload = { v: 2, email_normalized: emailNormalized, scope: 'marketing', exp: Math.floor(now / 1000) + expInSeconds };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function unsubscribeUrlFor(email, { secret, supabaseUrl }) {
  const token = createUnsubscribeToken(email, secret);
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/unsubscribe-email?token=${encodeURIComponent(token)}`;
}

/** RFC 2369 + RFC 8058 one-click headers (same as sendEmail's marketing headers). */
export function listUnsubscribeHeaders(unsubscribeUrl) {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Footer appended to every outbound template: postal address + unsubscribe link. */
export function renderFooter({ unsubscribeUrl, postalAddress }) {
  const text = `\n\n--\nJob-Hopper, ${postalAddress}\nDon't want emails like this? Unsubscribe: ${unsubscribeUrl}`;
  const html =
    `\n<p style="margin:2em 0 0;font-size:12px;color:#6b7280;">Job-Hopper, ${escapeHtml(postalAddress)}<br>` +
    `Don't want emails like this? <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p>`;
  return { text, html };
}

/**
 * The footer config the sends need, read from env: UNSUBSCRIBE_EMAIL_SECRET (same value
 * as the edge-function secret), SUPABASE_URL, and OUTBOUND_POSTAL_ADDRESS.
 * Returns { config, missing }; config is null when anything is missing.
 */
export function readFooterConfig(env = process.env) {
  const secret = env.UNSUBSCRIBE_EMAIL_SECRET;
  const supabaseUrl = env.SUPABASE_URL;
  const postalAddress = env.OUTBOUND_POSTAL_ADDRESS?.trim();
  const missing = [
    !secret && 'UNSUBSCRIBE_EMAIL_SECRET',
    !supabaseUrl && 'SUPABASE_URL',
    !postalAddress && 'OUTBOUND_POSTAL_ADDRESS',
  ].filter(Boolean);
  return { config: missing.length ? null : { secret, supabaseUrl, postalAddress }, missing };
}

/**
 * footerFor(email) -> { text, html, unsubscribeUrl }, as buildDedupedSends expects.
 * With a full config the link is a real signed token. Without one (preview / dry run
 * only -- the live send refuses to start), it renders a visible placeholder so the
 * layout can still be reviewed.
 */
export function makeFooterFor(config, missing = []) {
  if (config) {
    return (email) => {
      const unsubscribeUrl = unsubscribeUrlFor(email, config);
      return { ...renderFooter({ unsubscribeUrl, postalAddress: config.postalAddress }), unsubscribeUrl };
    };
  }
  const note = `(not configured: ${missing.join(', ')})`;
  return () => ({ ...renderFooter({ unsubscribeUrl: note, postalAddress: note }), unsubscribeUrl: null });
}
