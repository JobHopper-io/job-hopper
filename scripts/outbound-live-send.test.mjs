// node --test scripts/outbound-live-send.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

// --- footer config gate (step 2b): a real send refuses to start, a preview still runs ---
const SCRIPT = fileURLToPath(new URL('./outbound-live-send.mjs', import.meta.url));
// Dummy Supabase env: the gate runs before any query, so nothing is contacted.
const BASE_ENV = { PATH: process.env.PATH, SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'dummy' };

function runLive(extraEnv, args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { env: { ...BASE_ENV, ...extraEnv }, encoding: 'utf8', timeout: 20000 });
}

test('live send refuses to start without OUTBOUND_POSTAL_ADDRESS', () => {
  const r = runLive({ UNSUBSCRIBE_EMAIL_SECRET: 's', MAILTRAP_API_TOKEN: 't' }, ['--campaign=test']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to send: missing OUTBOUND_POSTAL_ADDRESS/);
});

test('live send refuses to start without UNSUBSCRIBE_EMAIL_SECRET', () => {
  const r = runLive({ OUTBOUND_POSTAL_ADDRESS: '1 Main St', MAILTRAP_API_TOKEN: 't' }, ['--campaign=test']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to send: missing UNSUBSCRIBE_EMAIL_SECRET/);
});

test('preview without footer config gets past the gate (warns, then tries to query)', () => {
  const r = runLive({}, ['--preview']);
  assert.match(r.stderr, /WARNING: footer not configured/);
  assert.doesNotMatch(r.stderr, /Refusing to send/);
});
