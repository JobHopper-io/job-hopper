// node --test scripts/outbound-live-send.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isEmailSuppressed } from './outbound-live-send.mjs';

function fakeSupabase(response) {
  const calls = [];
  return {
    calls,
    rpc: (name, args) => {
      calls.push([name, args]);
      return Promise.resolve(response);
    },
  };
}

test('calls is_email_suppressed as marketing and returns its answer', async () => {
  const supabase = fakeSupabase({ data: true, error: null });
  assert.equal(await isEmailSuppressed(supabase, 'Gone@Example.com'), true);
  assert.deepEqual(supabase.calls, [['is_email_suppressed', { p_email: 'Gone@Example.com', p_kind: 'marketing' }]]);
  assert.equal(await isEmailSuppressed(fakeSupabase({ data: false, error: null }), 'ok@example.com'), false);
});

test('an RPC error throws (fail closed)', async () => {
  await assert.rejects(
    isEmailSuppressed(fakeSupabase({ data: null, error: { message: 'boom' } }), 'a@example.com'),
    /Failed to check suppressed_emails for example\.com: boom/,
  );
});

test('a non-boolean answer throws instead of reading as "not suppressed"', async () => {
  await assert.rejects(isEmailSuppressed(fakeSupabase({ data: null, error: null }), 'a@example.com'), /returned null/);
});
