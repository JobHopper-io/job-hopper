// node --test scripts/prospect-classifier.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAREER_LEVELS,
  ROLE_CATEGORIES,
  SEGMENTS,
  CONTRACT_ONLY_CAP,
  NO_TARGET_CAP,
  buildSystemPrompt,
  buildUpdate,
  classifySnippet,
  extractJson,
  finalizeClassification,
  scoreDistribution,
  titleCase,
  topDemandCategories,
  withNetworkRetry,
  sanitizeSnippet,
  validateClassification,
} from './prospect-classifier.mjs';

const valid = {
  segments: ['active_job_seeker', 'remote_seeker'],
  needs_sponsorship: null,
  contract_or_freelance_only: false,
  clear_target_role: true,
  intent_score: 85,
  intent_reason: 'Actively seeking a remote backend role with a clear stack and availability.',
  target_job_title: 'Backend Engineer',
  years_of_experience: 4, // under the seniority floor, so each rule test isolates one rule
  target_role_categories: ['engineering'],
  career_level: 'entry_mid',
};

test('a valid classification passes and is normalized', () => {
  const r = validateClassification({ ...valid, segments: ['remote_seeker', 'remote_seeker'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.segments, ['remote_seeker']);
  assert.equal(validateClassification({ ...valid, target_job_title: 'embedded  engineer' }).value.target_job_title, 'Embedded Engineer');
  assert.equal(validateClassification({ ...valid, intent_score: 120 }).ok, true, 'out-of-range integers are clamped later, not rejected');
});

const fin = (over) => finalizeClassification({ ...validateClassification(valid).value, ...over });

test('contract/freelance only caps the score at 30', () => {
  const r = fin({ contract_or_freelance_only: true, intent_score: 75 });
  assert.equal(r.value.intent_score, CONTRACT_ONLY_CAP);
  assert.deepEqual(r.applied, ['contract_cap']);
  assert.match(r.value.intent_reason, /\(capped: contract\/freelance only\)$/);
  assert.ok(r.value.intent_reason.length <= 160);
  assert.equal(fin({ contract_or_freelance_only: true, intent_score: 20 }).value.intent_score, 20, 'already under the cap');
});

test('no clear target role caps the score at 60 (flag false, or no title)', () => {
  assert.equal(fin({ clear_target_role: false, intent_score: 90 }).value.intent_score, NO_TARGET_CAP);
  assert.equal(fin({ target_job_title: null, intent_score: 90 }).value.intent_score, NO_TARGET_CAP);
  assert.equal(fin({ clear_target_role: false, intent_score: 40 }).value.intent_score, 40);
  const both = fin({ contract_or_freelance_only: true, clear_target_role: false, intent_score: 95 });
  assert.equal(both.value.intent_score, CONTRACT_ONLY_CAP, 'the lower cap wins');
});

test('score is clamped to 0-100', () => {
  assert.equal(fin({ intent_score: 130 }).value.intent_score, 100);
  assert.equal(fin({ intent_score: -20 }).value.intent_score, 0);
  assert.deepEqual(fin({ intent_score: 130 }).applied, ['clamped']);
  assert.deepEqual(fin({ intent_score: 85 }).applied, []);
});

test('seniority floor: 8+ years or a senior title cannot be entry_mid', () => {
  assert.equal(fin({ years_of_experience: 8, career_level: 'entry_mid' }).value.career_level, 'senior_management');
  assert.equal(fin({ years_of_experience: 7, career_level: 'entry_mid' }).value.career_level, 'entry_mid');
  for (const title of ['Senior Software Engineer', 'Staff Engineer', 'Principal Engineer', 'Lead Data Engineer', 'Head of Engineering', 'Director of Engineering']) {
    const r = fin({ target_job_title: title, years_of_experience: null, career_level: 'entry_mid' });
    assert.equal(r.value.career_level, 'senior_management', title);
    assert.ok(r.applied.includes('seniority_floor'));
  }
  assert.equal(fin({ years_of_experience: 15, career_level: 'director_vp_c_level' }).value.career_level, 'director_vp_c_level', 'never lowered');
  assert.equal(fin({ years_of_experience: 15, career_level: null }).value.career_level, null, 'unknown stays unknown');
});

test('demand categories and prompt', () => {
  const top = topDemandCategories([
    { category: 'engineering', jobs: 400 }, { category: 'operations', jobs: 220 }, { category: 'management', jobs: 90 }, { category: 'other', jobs: 0 },
  ]);
  assert.deepEqual(top.map((c) => c.category), ['engineering', 'operations']);
  assert.deepEqual(topDemandCategories([{ category: 'engineering', jobs: 0 }]), []);
  const prompt = buildSystemPrompt(top);
  assert.match(prompt, /engineering \(400 jobs in the last 30 days\), operations \(220 jobs/);
  assert.match(prompt, /Start at 50/);
  assert.match(prompt, /senior_management: senior, staff, principal and lead individual contributors/);
  assert.match(buildSystemPrompt([]), /no recent job data/);
});

test('titleCase and score distribution', () => {
  assert.equal(titleCase('head of engineering'), 'Head of Engineering');
  assert.equal(titleCase('ml engineer'), 'ML Engineer');
  assert.equal(titleCase('ios developer'), 'iOS Developer');
  assert.equal(titleCase('devops engineer'), 'DevOps Engineer');
  assert.deepEqual(scoreDistribution([95, 30, 60, 45, 80]), { n: 5, min: 30, median: 60, max: 95, '0-39': 1, '40-59': 1, '60-79': 1, '80-100': 2 });
  assert.equal(scoreDistribution([40, 60]).median, 50);
});

test('rejects unknown segments and enum values', () => {
  const cases = [
    [{ ...valid, segments: ['active_job_seeker', 'unicorn'] }, /segments/],
    [{ ...valid, target_role_categories: ['software'] }, /target_role_categories/],
    [{ ...valid, career_level: 'senior' }, /career_level/],
    [{ ...valid, needs_sponsorship: 'maybe' }, /needs_sponsorship/],
    [{ ...valid, intent_score: 72.5 }, /intent_score/],
    [{ ...valid, intent_score: '80' }, /intent_score/],
    [{ ...valid, contract_or_freelance_only: 'no' }, /contract_or_freelance_only/],
    [{ ...valid, clear_target_role: null }, /clear_target_role/],
    [{ ...valid, target_job_title: 'Engineer' }, /target_job_title/],
    [{ ...valid, target_job_title: 'Builder of delightful things for the web' }, /target_job_title/],
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
    target_job_title: 'Backend Engineer', years_of_experience: 4, target_role_categories: ['engineering'], career_level: 'entry_mid',
  });
  const existing = buildUpdate({ target_job_title: 'SRE', years_of_experience: 3, target_role_categories: ['operations'], career_level: 'senior_management' }, v, 'm', 'T');
  assert.equal('target_job_title' in existing || 'years_of_experience' in existing || 'target_role_categories' in existing || 'career_level' in existing, false);
  for (const forbidden of ['review_status', 'consent_status', 'email', 'reviewed_by']) {
    assert.equal(forbidden in fresh, false, forbidden);
  }
});

test('network failures are retried; HTTP errors and other errors are not', async () => {
  let calls = 0;
  const flaky = withNetworkRetry(() => (++calls < 3 ? Promise.reject(new TypeError('fetch failed')) : Promise.resolve('ok')), { backoffMs: 1 });
  assert.equal(await flaky(), 'ok');
  assert.equal(calls, 3);
  calls = 0;
  const down = withNetworkRetry(() => { calls += 1; return Promise.reject(new TypeError('fetch failed')); }, { backoffMs: 1 });
  await assert.rejects(down(), /fetch failed/);
  assert.equal(calls, 3, '1 try + 2 retries');
  calls = 0;
  const other = withNetworkRetry(() => { calls += 1; return Promise.reject(new Error('bad request body')); }, { backoffMs: 1 });
  await assert.rejects(other(), /bad request body/);
  assert.equal(calls, 1);
  const http500 = withNetworkRetry(() => Promise.resolve({ status: 500 }), { backoffMs: 1 });
  assert.equal((await http500()).status, 500);
});
