// Cross-runtime check: tokens signed by the Node outbound scripts
// (scripts/outbound-unsubscribe.mjs) must verify with the edge function's verifier.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { isValidUnsubscribeUrl, verifyUnsubscribeToken } from '../unsubscribe-token.ts'
import {
  createUnsubscribeToken,
  listUnsubscribeHeaders,
  makeFooterFor,
  readFooterConfig,
  unsubscribeUrlFor,
} from '../../../../scripts/outbound-unsubscribe.mjs'

const SECRET = 'shared-secret'

Deno.test('outbound (Node) token verifies with the edge function verifier as v2 marketing', async () => {
  const verified = await verifyUnsubscribeToken(createUnsubscribeToken('  Dean@Acme.EDU ', SECRET), SECRET)
  assert(verified && verified.v === 2)
  assertEquals(verified.email_normalized, 'dean@acme.edu')
  assertEquals(verified.scope, 'marketing')
  assertEquals(verified.profile_id, undefined)
})

Deno.test('outbound token signed with another secret, or expired, does not verify', async () => {
  assertEquals(await verifyUnsubscribeToken(createUnsubscribeToken('a@b.com', 'other'), SECRET), null)
  assertEquals(await verifyUnsubscribeToken(createUnsubscribeToken('a@b.com', SECRET, { expInSeconds: -60 }), SECRET), null)
})

Deno.test('outbound unsubscribe URL is a valid unsubscribe-email link (what sendEmail would accept)', () => {
  const url = unsubscribeUrlFor('a@b.com', { secret: SECRET, supabaseUrl: 'https://proj.supabase.co/' })
  assert(url.startsWith('https://proj.supabase.co/functions/v1/unsubscribe-email?token='))
  assert(isValidUnsubscribeUrl(url))
  assertEquals(listUnsubscribeHeaders(url), { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
})

Deno.test('footer: postal address + per-recipient link in text and html; html is escaped', async () => {
  const footerFor = makeFooterFor({ secret: SECRET, supabaseUrl: 'https://proj.supabase.co', postalAddress: '1 Main St <Suite 2>, Austin, TX' })
  const f = footerFor('dean@acme.edu')
  assert(f.unsubscribeUrl, 'configured footer must have a link')
  assert(f.text.includes('1 Main St <Suite 2>, Austin, TX') && f.text.includes(`Unsubscribe: ${f.unsubscribeUrl}`))
  assert(f.html.includes('1 Main St &lt;Suite 2&gt;, Austin, TX') && f.html.includes('>Unsubscribe</a>'))
  const token = new URL(f.unsubscribeUrl).searchParams.get('token')!
  assertEquals((await verifyUnsubscribeToken(token, SECRET))?.v, 2)
  assert(footerFor('other@acme.edu').unsubscribeUrl !== f.unsubscribeUrl, 'link must be per recipient')
})

Deno.test('readFooterConfig reports each missing variable; placeholder footer has no link', () => {
  const { config, missing } = readFooterConfig({ SUPABASE_URL: 'https://p.supabase.co', OUTBOUND_POSTAL_ADDRESS: '   ' })
  assertEquals(config, null)
  assertEquals(missing, ['UNSUBSCRIBE_EMAIL_SECRET', 'OUTBOUND_POSTAL_ADDRESS'])
  const placeholder = makeFooterFor(null, missing)('a@b.com')
  assertEquals(placeholder.unsubscribeUrl, null)
  assert(placeholder.text.includes('not configured: UNSUBSCRIBE_EMAIL_SECRET, OUTBOUND_POSTAL_ADDRESS'))
  assert(!/\[[^\]]+\]/.test(placeholder.text), 'placeholder must not look like an unfilled [token]')
})
