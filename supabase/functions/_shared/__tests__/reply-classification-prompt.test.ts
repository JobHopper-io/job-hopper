import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { REPLY_CLASSES, normalizeReplyClass, replyClassificationUserMessage } from '../reply-classification-prompt.ts'

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

Deno.test('replyClassificationUserMessage embeds the reply fields and handles nulls', () => {
  const msg = replyClassificationUserMessage({ fromEmail: 'a@b.edu', subject: 'Re: Job-Hopper', body: 'Please remove me from this list.' })
  assertEquals(msg.includes('a@b.edu'), true)
  assertEquals(msg.includes('Please remove me from this list.'), true)

  const msgNulls = replyClassificationUserMessage({ fromEmail: 'a@b.edu', subject: null, body: null })
  assertEquals(msgNulls.includes('(no subject)'), true)
  assertEquals(msgNulls.includes('(no body)'), true)
})
