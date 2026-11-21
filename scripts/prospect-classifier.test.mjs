// node --test scripts/prospect-classifier.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAREER_LEVELS,
  ROLE_CATEGORIES,
  SEGMENTS,
  buildUpdate,
  classifySnippet,
  extractJson,
  sanitizeSnippet,
  validateClassification,
} from './prospect-classifier.mjs';

const valid = {
  segments: ['active_job_seeker', 'remote_seeker'],
  needs_sponsorship: null,
  intent_score: 85,
  intent_reason: 'Actively seeking a remote backend role with a clear stack and availability.',
  target_job_title: 'Backend Engineer',
  years_of_experience: 8,
  target_role_categories: ['engineering'],
  career_level: 'entry_mid',
};

test('a valid classification passes and is normalized', () => {
  const r = validateClassification({ ...valid, segments: ['remote_seeker', 'remote_seeker'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.segments, ['remote_seeker']);
});

test('rejects unknown segments and enum values', () => {
  const cases = [
    [{ ...valid, segments: ['active_job_seeker', 'unicorn'] }, /segments/],
    [{ ...valid, target_role_categories: ['software'] }, /target_role_categories/],
    [{ ...valid, career_level: 'senior' }, /career_level/],
    [{ ...valid, needs_sponsorship: 'maybe' }, /needs_sponsorship/],
    [{ ...valid, intent_score: 101 }, /intent_score/],
    [{ ...valid, intent_score: 72.5 }, /intent_score/],
    [{ ...valid, years_of_experience: '10+' }, /years_of_experience/],
    [{ ...valid, intent_reason: 'x'.repeat(161) }, /intent_reason/],
    [{ ...valid, intent_reason: 'Reach them at jo@example.com' }, /intent_reason/],
    [{ ...valid, segments: 'active_job_seeker' }, /segments/],
  ];
  for (const [input, pattern] of cases) {
    const r = validateClassification(input);
    assert.equal(r.ok, false, JSON.stringify(input));
    assert.match(r.errors.join(' | '), pattern);
  }
  assert.equal(validateClassification(null).ok, false);
  assert.equal(validateClassification([valid]).ok, false);
  assert.deepEqual(ROLE_CATEGORIES, ['operations', 'maintenance', 'engineering', 'management', 'executive', 'other']);
  assert.deepEqual(CAREER_LEVELS, ['entry_mid', 'senior_management', 'director_vp_c_level']);
  assert.equal(SEGMENTS.length, 6);
});

test('sanitizeSnippet strips emails (plain and obfuscated) and URLs', () => {
  const s = sanitizeSnippet(
    'Location: Austin, TX Email: kara@kara.dev or kara [at] kara [dot] dev or kara at kara dot dev ' +
    'CV: https://kara.dev/cv.pdf site www.kara.dev and kara.dev/blog. Stack: ASP.NET, Node.js',
  );
  assert.ok(!/@|\[at\]|\bat kara|https?:|www\.|kara\.dev/i.test(s), s);
  assert.match(s, /Location: Austin, TX/);
  assert.match(s, /ASP\.NET, Node\.js/, 'tech names survive');
  assert.match(s, /\[email\].*\[email\].*\[email\]/);
  assert.match(s, /\[link\]/);
  assert.equal(sanitizeSnippet(null), '');
});

test('extractJson tolerates code fences and surrounding text', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":1} hope that helps'), { a: 1 });
  assert.equal(extractJson('not json at all'), null);
});

test('invalid JSON is retried once, with the error fed back, then succeeds', async () => {
  const seen = [];
  const replies = ['Sure! The person is looking for work.', JSON.stringify(valid)];
  const r = await classifySnippet((messages) => {
    seen.push(messages.length);
    return Promise.resolve({ text: replies.shift(), usage: { prompt_tokens: 100, completion_tokens: 20 } });
  }, 'Looking for a backend role.');
  assert.equal(r.ok, true);
  assert.equal(r.calls, 2);
  assert.deepEqual(seen, [2, 4], 'second call carries the bad reply and the correction request');
  assert.deepEqual(r.usage, { prompt_tokens: 200, completion_tokens: 40 });
});

test('invalid output twice: skipped, not retried a third time', async () => {
  let calls = 0;
  const r = await classifySnippet(() => {
    calls += 1;
    return Promise.resolve({ text: JSON.stringify({ ...valid, segments: ['unicorn'] }) });
  }, 'x');
  assert.equal(r.ok, false);
  assert.equal(calls, 2);
  assert.match(r.errors.join(' '), /segments/);
});

test('buildUpdate fills profile fields only where null; never touches review/consent/email', () => {
  const v = validateClassification(valid).value;
  const fresh = buildUpdate({ target_job_title: null, years_of_experience: null, target_role_categories: null, career_level: null }, v, 'm', 'T');
  assert.deepEqual(fresh, {
    segments: v.segments, needs_sponsorship: null, intent_score: 85, intent_reason: v.intent_reason,
    classified_at: 'T', classifier_model: 'm',
    target_job_title: 'Backend Engineer', years_of_experience: 8, target_role_categories: ['engineering'], career_level: 'entry_mid',
  });
  const existing = buildUpdate({ target_job_title: 'SRE', years_of_experience: 3, target_role_categories: ['operations'], career_level: 'senior_management' }, v, 'm', 'T');
  assert.equal('target_job_title' in existing || 'years_of_experience' in existing || 'target_role_categories' in existing || 'career_level' in existing, false);
  for (const forbidden of ['review_status', 'consent_status', 'email', 'reviewed_by']) {
    assert.equal(forbidden in fresh, false, forbidden);
  }
});
