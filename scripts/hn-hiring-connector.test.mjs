// node --test scripts/hn-hiring-connector.test.mjs
// Sample comments are in the HTML form the HN Algolia API returns (<p>, &#x2F;, links).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SIGNAL_TYPE,
  SOURCE,
  decodeEmail,
  detectCountry,
  extractFields,
  htmlToText,
  maskEmail,
  parseComment,
  parseRemote,
  selectPosts,
  toEvidenceRow,
  toProspectRow,
} from './hn-hiring-connector.mjs';

const comment = (id, author, html) => ({ id, author, text: html, created_at: '2026-11-02T16:30:00.000Z' });

const OBFUSCATED = comment(101, 'kara_dev',
  'Location: Austin, TX<p>Remote: Yes<p>Willing to relocate: No<p>Technologies: Go, Rust, Postgres, Kubernetes' +
  '<p>R&#x00E9;sum&#x00E9;&#x2F;CV: <a href="https:&#x2F;&#x2F;kara.dev&#x2F;cv.pdf" rel="nofollow">https:&#x2F;&#x2F;kara.dev&#x2F;cv.pdf</a>' +
  '<p>Email: kara [at] kara [dot] dev<p>Backend engineer, 8 years. I like boring, reliable systems.');

const NO_EMAIL = comment(102, 'quietbuilder',
  'Location: Lisbon, Portugal<p>Remote: Yes<p>Willing to relocate: No<p>Technologies: Elixir, Phoenix, LiveView' +
  '<p>Résumé&#x2F;CV: on request<p>Email: see profile<p>Ten years of Elixir. Ping me through my HN profile.');

const US_CITY = comment(103, 'sfdesigner',
  'Location: San Francisco<p>Remote: No, prefer hybrid<p>Willing to relocate: No<p>Technologies: Figma, React' +
  '<p>Email: <a href="mailto:jo@designjo.com">jo@designjo.com</a><p>Product designer who codes.');

const NON_US_CITY = comment(104, 'berlin_ml',
  'Location: Berlin, Germany (open to US hours)<p>Remote: Yes<p>Willing to relocate: Yes (US, Canada)' +
  '<p>Technologies: PyTorch, JAX<p>Email: ml.person at gmail.com<p>ML engineer.');

const REMOTE_ONLY = comment(105, 'nomadic',
  'Location: Remote<p>Remote: Yes (remote only)<p>Willing to relocate: No<p>Technologies: TypeScript, Node' +
  '<p>Email: nomad@fastmail.com<p>Full-stack, timezone-flexible.');

// Fields on one line, odd separators, a doubled label, no Remote field, indented bullets.
const MESSY = comment(106, 'Ankur_K',
  '  Location: Seattle, WA; Remote: open to remote or onsite | Technologies: Technologies: Python, ML' +
  '<p>  • CV - <a href="https:&#x2F;&#x2F;example.org&#x2F;a-very-long-path&#x2F;resume-2026-final-v2.pdf" rel="nofollow">https:&#x2F;&#x2F;example.org&#x2F;a-very-long-pa...</a>' +
  '<p>Email - ankur.k at kretoss dot com<p>Remote-first teams preferred. Data scientist.');

test('obfuscated email "[at]" / "[dot]" is decoded; US state abbreviation -> US', () => {
  const p = parseComment(OBFUSCATED);
  assert.equal(p.email, 'kara@kara.dev');
  assert.equal(p.country, 'US');
  assert.equal(p.openToRemote, true);
  assert.equal(p.fields.technologies, 'Go, Rust, Postgres, Kubernetes');
  assert.equal(p.fields.resume, 'https://kara.dev/cv.pdf');
  assert.deepEqual(p.preferredLocations, ['Austin, TX']);
});

test('no email: "see profile" is not turned into an address, and nothing is guessed', () => {
  const p = parseComment(NO_EMAIL);
  assert.equal(p.email, null);
  assert.equal(p.country, null, 'Portugal is not US');
  assert.equal(p.fields.resume, 'on request');
  assert.equal(decodeEmail('first.last at gmail'), null, 'incomplete address stays null');
  assert.equal(decodeEmail('rafael.melhem [at] gmail'), null, 'no TLD is not guessed');
  assert.equal(decodeEmail('[d]@[dvt].[name]'), null, 'puzzle obfuscation is not solved');
  assert.equal(decodeEmail('my username at the usual google domain'), null);
});

test('US city without a state -> US; "No, prefer hybrid" -> not remote; mailto link -> address', () => {
  const p = parseComment(US_CITY);
  assert.equal(p.country, 'US');
  assert.equal(p.openToRemote, false);
  assert.equal(p.email, 'jo@designjo.com');
});

test('non-US city that mentions US hours/relocation is not US; "name at domain.com" decoded', () => {
  const p = parseComment(NON_US_CITY);
  assert.equal(p.country, null);
  assert.equal(p.email, 'ml.person@gmail.com');
  assert.deepEqual(p.preferredLocations, ['Berlin, Germany (open to US hours)']);
});

test('"Remote" alone is not a country and not a preferred location', () => {
  const p = parseComment(REMOTE_ONLY);
  assert.equal(p.country, null);
  assert.equal(p.openToRemote, true);
  assert.equal(p.preferredLocations, null);
  assert.equal(detectCountry('Remote'), null);
  assert.equal(detectCountry('Remote (anywhere)'), null);
});

test('messy format: one-line fields, "|"/";" separators, doubled label, bullets, "Label - value", truncated link', () => {
  const p = parseComment(MESSY);
  assert.equal(p.fields.location, 'Seattle, WA');
  assert.equal(p.country, 'US');
  assert.equal(p.openToRemote, true, '"open to remote or onsite"');
  assert.equal(p.fields.technologies, 'Python, ML', 'doubled label dropped');
  assert.equal(p.fields.resume, 'https://example.org/a-very-long-path/resume-2026-final-v2.pdf', 'full href, not truncated text');
  assert.equal(p.email, 'ankur.k@kretoss.com');
  assert.equal(extractFields('Remote-first teams preferred.').remote, undefined, '"Remote-first" is not a field');
});

test('more obfuscation styles seen in real threads', () => {
  assert.equal(decodeEmail('jesse :at: barelybrand.co'), 'jesse@barelybrand.co');
  assert.equal(decodeEmail('ptx2 at-sign ptx2 dot net'), 'ptx2@ptx2.net');
  assert.equal(decodeEmail('hn [at-symbol] vixe.re'), 'hn@vixe.re');
  assert.equal(decodeEmail('jane (at) example (dot) org'), 'jane@example.org');
  assert.equal(decodeEmail('name {at} host {dot} io'), 'name@host.io');
  assert.equal(decodeEmail('see CV'), null);
});

test('country detection edge cases', () => {
  assert.equal(detectCountry('USA'), 'US');
  assert.equal(detectCountry('United States (EST)'), 'US');
  assert.equal(detectCountry('Brooklyn'), 'US');
  assert.equal(detectCountry('Portland, OR'), 'US');
  assert.equal(detectCountry('Raleigh, North Carolina'), 'US');
  assert.equal(detectCountry('Tbilisi, Georgia'), null, 'Georgia the country');
  assert.equal(detectCountry('EU/US timezones'), null);
  assert.equal(detectCountry('Toronto, Canada'), null);
  assert.equal(detectCountry('India; open to US clients'), null);
  assert.equal(detectCountry('Lahore, Pakistan (UTC+5)'), null);
  assert.equal(detectCountry('Bangalore, IN'), null, '", IN" after a non-US city');
  assert.equal(detectCountry('Lagos, Nigeria'), null);
  assert.equal(detectCountry(null), null);
});

test('remote field parsing', () => {
  assert.equal(parseRemote('Yes', null), true);
  assert.equal(parseRemote('Yes (EU/EMEA, open to B2B contracts)', null), true);
  assert.equal(parseRemote('No', null), false);
  assert.equal(parseRemote('Hybrid or remote', null), true);
  assert.equal(parseRemote('depends', null), null);
  assert.equal(parseRemote(undefined, 'Denizli, Turkey (Remote only)'), true);
  assert.equal(parseRemote(undefined, 'Austin, TX'), null);
});

test('skips deleted comments and posts with no profile fields', () => {
  const { posts, skipped } = selectPosts([
    OBFUSCATED,
    { id: 200, author: null, text: null },
    comment(201, 'meta_person', 'Is this thread also for contract work? Asking for a friend.'),
  ]);
  assert.deepEqual(posts.map((p) => p.id), ['101']);
  assert.deepEqual(skipped, { deleted_or_no_text: 1, no_profile_fields: 1 });
});

test('prospect and evidence rows', () => {
  const p = parseComment(OBFUSCATED);
  assert.deepEqual(toProspectRow(p), {
    kind: 'job_seeker', source: SOURCE, source_ref: '101', first_name: 'kara_dev', email: 'kara@kara.dev',
    country: 'US', open_to_remote: true, preferred_locations: ['Austin, TX'],
  });
  const e = toEvidenceRow(p, 'prospect-1');
  assert.equal(e.url, 'https://news.ycombinator.com/item?id=101');
  assert.equal(e.found_at, '2026-11-02T16:30:00.000Z');
  assert.equal(e.signal_type, SIGNAL_TYPE);
  assert.equal(e.source, SOURCE);
  assert.ok(e.snippet.startsWith('Location: Austin, TX Remote: Yes'), 'plain text, whitespace collapsed');
  assert.ok(!e.snippet.includes('<'), 'no HTML');
  const long = parseComment(comment(102, 'x', `Location: USA<p>${'word '.repeat(300)}`));
  assert.equal(toEvidenceRow(long, 'p').snippet.length, 500);
});

test('htmlToText decodes entities and keeps paragraph breaks; maskEmail', () => {
  assert.equal(htmlToText('a &amp; b<p>c &#x27;d&#x27; &quot;e&quot;'), 'a & b\n\nc \'d\' "e"');
  assert.equal(maskEmail('kara@kara.dev'), 'k***@kara.dev');
  assert.equal(maskEmail(null), null);
});
