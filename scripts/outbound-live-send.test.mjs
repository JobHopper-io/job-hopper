// node --test scripts/outbound-live-send.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { blockedEventRow, enrollmentRows, isEmailSuppressed, logBlockedOnce, logOutboundEvent, outboundEventRow, pickLeadsToEnroll } from './outbound-live-send.mjs';

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

test('enrolling requires --campaign; preview does not', () => {
  const r = runLive({}, []);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--campaign=<tag> is required to enroll/);
  assert.match(runLive({}, ['--campaign=bad tag!']).stderr, /--campaign must be letters, digits and dashes/);
});

test('preview without footer config warns that the runner will refuse, then tries to query', () => {
  const r = runLive({}, ['--preview']);
  assert.match(r.stderr, /WARNING: footer not configured/);
  assert.match(r.stderr, /runner will refuse to send/);
  assert.doesNotMatch(r.stderr, /--campaign=<tag> is required/);
});

// --- enrollment (outreach sequences) ---

const lead = (id, name, email, score = 80) => ({ id, organization_name: name, contact_email: email, opportunity_score: score, category: 'university' });

test('pickLeadsToEnroll: exclusion (case-insensitive), already enrolled, one lead per shared inbox', () => {
  const leads = [
    lead('l1', 'State University', 'dean@state.edu'),
    lead('l2', 'State University - Satellite', 'DEAN@state.edu '),
    lead('l3', 'Excluded College', 'x@excluded.edu'),
    lead('l4', 'Enrolled U', 'a@enrolled.edu'),
    lead('l5', 'Other U', 'b@other.edu'),
  ];
  const { enroll, skipped } = pickLeadsToEnroll(leads, { exclusionNames: ['  excluded college '], enrolledLeadIds: new Set(['l4']) });
  assert.deepEqual(enroll.map((l) => l.id), ['l1', 'l5']);
  assert.deepEqual(skipped.map((s) => [s.lead.id, s.reason]), [['l2', 'shared_inbox'], ['l3', 'exclusion_lists'], ['l4', 'already_enrolled']]);
  assert.equal(skipped[0].with, 'State University');
});

test('enrollmentRows: one stage-1 row per lead/prospect, due now, keyed by campaign', () => {
  const now = new Date('2026-11-25T09:00:00Z');
  assert.deepEqual(enrollmentRows({ leadIds: ['l1'], prospectIds: ['p1'] }, 'nov-2026', now), [
    { sequence_key: 'outreach_nov-2026', sequence_stage: 1, scheduled_date: '2026-11-25T09:00:00.000Z', institutional_lead_id: 'l1' },
    { sequence_key: 'outreach_nov-2026', sequence_stage: 1, scheduled_date: '2026-11-25T09:00:00.000Z', prospect_id: 'p1' },
  ]);
});

// --- send log rows (step 3) ---

test('outboundEventRow: type outbound, primary lead, normalized address, campaign, message id', () => {
  const row = outboundEventRow({
    toEmail: ' Dean@Acme.EDU ', leadIds: ['l1', 'l2'], orgNames: ['Acme', 'Acme West'], category: 'university',
    merged: true, subject: 'Hi', campaign: 'c1', status: 'sent', messageId: 'm1',
  });
  assert.deepEqual(row, {
    type: 'outbound', profile_id: null, institutional_lead_id: 'l1', to_email_normalized: 'dean@acme.edu',
    campaign: 'c1', subject: 'Hi', template_key: 'outbound_university_generic', provider_message_id: 'm1',
    status: 'sent', error_message: null,
    payload: { institutional_lead_ids: ['l1', 'l2'], organization_names: ['Acme', 'Acme West'], category: 'university', merged: true },
  });
});

test('blockedEventRow: failed, machine-readable blocked_reason, readable error, no message id', () => {
  const row = blockedEventRow({ reason: 'suppressed_emails', toEmail: 'x@y.com', leadIds: ['l9'], orgNames: ['Y'], category: 'employer', campaign: 'c1' });
  assert.equal(row.status, 'failed');
  assert.equal(row.payload.blocked_reason, 'suppressed_emails');
  assert.equal(row.error_message, 'blocked: address is in suppressed_emails');
  assert.equal(row.provider_message_id, null);
  assert.equal(row.template_key, 'outbound_employer');
  const atSend = blockedEventRow({ reason: 'exclusion_lists', atSendTime: true, toEmail: 'x@y.com', leadIds: ['l9'], orgNames: ['Y'], category: 'employer', campaign: 'c1' });
  assert.equal(atSend.error_message, 'blocked at send time: company is on exclusion_lists');
  assert.equal(outboundEventRow({ toEmail: 'a@b.c', leadIds: ['l'], orgNames: [], category: 'x', campaign: 'c', status: 'sent' }).payload.blocked_reason, undefined);
});

// Minimal stand-in for supabase.from('email_events').select().eq()...limit() and .insert().
function fakeEventsTable({ existing = [], selectError = null } = {}) {
  const inserted = [];
  const filters = [];
  const query = {
    select: () => query,
    eq: (col, val) => (filters.push([col, val]), query),
    limit: () => Promise.resolve(selectError ? { data: null, error: selectError } : {
      data: existing.filter((r) => filters.every(([col, val]) =>
        col === 'payload->>blocked_reason' ? r.payload?.blocked_reason === val : r[col] === val)),
      error: null,
    }),
  };
  return {
    inserted,
    filters,
    from: () => ({ ...query, insert: (r) => (inserted.push(r), Promise.resolve({ error: null })) }),
  };
}

const blocked = (leadId, reason) =>
  blockedEventRow({ reason, toEmail: 'x@y.com', leadIds: [leadId], orgNames: ['Y'], category: 'employer', campaign: 'c2' });

test('logBlockedOnce writes the first blocked row for a lead + reason', async () => {
  const db = fakeEventsTable();
  assert.equal(await logBlockedOnce(db, blocked('l1', 'suppressed_emails')), true);
  assert.equal(db.inserted.length, 1);
  assert.deepEqual(db.filters, [['type', 'outbound'], ['institutional_lead_id', 'l1'], ['payload->>blocked_reason', 'suppressed_emails']]);
});

test('logBlockedOnce skips when the same lead was already blocked for the same reason (any campaign)', async () => {
  const db = fakeEventsTable({ existing: [{ type: 'outbound', institutional_lead_id: 'l1', payload: { blocked_reason: 'suppressed_emails' } }] });
  assert.equal(await logBlockedOnce(db, blocked('l1', 'suppressed_emails')), true);
  assert.equal(db.inserted.length, 0);
});

test('logBlockedOnce still writes for a different reason or a different lead', async () => {
  const existing = [{ type: 'outbound', institutional_lead_id: 'l1', payload: { blocked_reason: 'suppressed_emails' } }];
  const a = fakeEventsTable({ existing });
  await logBlockedOnce(a, blocked('l1', 'exclusion_lists'));
  assert.equal(a.inserted.length, 1);
  const b = fakeEventsTable({ existing });
  await logBlockedOnce(b, blocked('l2', 'suppressed_emails'));
  assert.equal(b.inserted.length, 1);
});

test('logBlockedOnce writes anyway if the duplicate check fails', async () => {
  const db = fakeEventsTable({ selectError: { message: 'boom' } });
  await logBlockedOnce(db, blocked('l1', 'suppressed_emails'));
  assert.equal(db.inserted.length, 1);
});

test('logOutboundEvent writes to email_events and reports (never throws) on failure', async () => {
  const writes = [];
  const ok = { from: (t) => ({ insert: (r) => (writes.push([t, r]), Promise.resolve({ error: null })) }) };
  assert.equal(await logOutboundEvent(ok, { status: 'sent' }), true);
  assert.deepEqual(writes, [['email_events', { status: 'sent' }]]);
  const failing = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'boom' } }) }) };
  assert.equal(await logOutboundEvent(failing, { status: 'sent' }), false);
});
