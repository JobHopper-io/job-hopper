import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  B2C_REPLY_CLASSES,
  B2C_REPLY_CLASSIFICATION_SYSTEM,
  normalizeB2cReplyClass,
  normalizeReplyClass,
  REPLY_CLASSES,
  replyAudience,
  replyClassificationUserMessage,
} from '../reply-classification-prompt.ts'

Deno.test('normalizeReplyClass accepts every canonical class verbatim', () => {
  for (const c of REPLY_CLASSES) {
    assertEquals(normalizeReplyClass(c), c)
  }
})

Deno.test('normalizeReplyClass is case-insensitive and tolerates trailing punctuation/whitespace', () => {
  assertEquals(normalizeReplyClass('unsubscribe'), 'Unsubscribe')
  assertEquals(normalizeReplyClass('  Not Interested.  '), 'Not interested')
  assertEquals(normalizeReplyClass('MEETING REQUESTED'), 'Meeting requested')
})

Deno.test('normalizeReplyClass refuses anything not on the list rather than guessing', () => {
  assertEquals(normalizeReplyClass('Maybe'), null)
  assertEquals(normalizeReplyClass('Interested, but only in Q3'), null)
  assertEquals(normalizeReplyClass(''), null)
})

Deno.test('replyClassificationUserMessage embeds subject and body, never the sender address', () => {
  const msg = replyClassificationUserMessage({ subject: 'Re: Job-Hopper', body: 'Please remove me from this list.' })
  assertEquals(msg.includes('Please remove me from this list.'), true)
  assertEquals(msg.includes('@'), false)
  const msgNulls = replyClassificationUserMessage({ subject: null, body: null })
  assertEquals(msgNulls.includes('(no subject)'), true)
  assertEquals(msgNulls.includes('(no body)'), true)
})

Deno.test('normalizeB2cReplyClass accepts every b2c class and common model sloppiness', () => {
  for (const c of B2C_REPLY_CLASSES) assertEquals(normalizeB2cReplyClass(c), c)
  assertEquals(normalizeB2cReplyClass('Role request.'), 'role_request')
  assertEquals(normalizeB2cReplyClass(' "already-employed" '), 'already_employed')
  assertEquals(normalizeB2cReplyClass('OUT OF OFFICE'), 'out_of_office')
  assertEquals(normalizeB2cReplyClass('Interested'), 'interested')
  assertEquals(normalizeB2cReplyClass('Meeting requested'), null)
  assertEquals(normalizeB2cReplyClass(''), null)
})

Deno.test('replyAudience: lead -> b2b, prospect or profile -> b2c, unmatched -> b2b', () => {
  assertEquals(replyAudience({ institutional_lead_id: 'l', prospect_id: 'p', profile_id: null }), 'b2b')
  assertEquals(replyAudience({ institutional_lead_id: null, prospect_id: 'p', profile_id: null }), 'b2c')
  assertEquals(replyAudience({ institutional_lead_id: null, prospect_id: null, profile_id: 'u' }), 'b2c')
  assertEquals(replyAudience({ institutional_lead_id: null, prospect_id: null, profile_id: null }), 'b2b')
})

Deno.test('the b2c prompt lists exactly the b2c classes', () => {
  for (const c of B2C_REPLY_CLASSES) assertEquals(B2C_REPLY_CLASSIFICATION_SYSTEM.includes(`- ${c}`), true, c)
})
