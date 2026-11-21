#!/usr/bin/env node
// Pulls job seekers' own posts from Hacker News "Ask HN: Who wants to be hired?" threads
// (posted monthly by the whoishiring account) and upserts them into prospects
// (kind='job_seeker', source='hn_who_wants_to_be_hired', source_ref=<comment id>) with one
// prospect_evidence row per post (signal_type='self_posted_seeking_work').
//
// Data: the official HN Algolia API finds the threads and returns each thread's comment tree
// in one request; Algolia leaves out deleted and dead comments (flagged comments become
// dead), and the official HN Firebase API's thread item gives the full top-level count so
// the skipped ones can be reported. Top-level comments only. 1 request per second.
//
// Parsing is conservative: an email is only taken from what's written (an Email/Contact
// field, with common "[at]"/"dot" obfuscation decoded, or a plain address anywhere); nothing
// is guessed. country is 'US' only when the Location field clearly is, and null otherwise
// (including "Remote" alone). consent_status stays 'none', so nobody here is eligible for
// outreach until reviewed (prospect_send_eligibility).
//
// Re-running is a no-op for posts already stored ((source, source_ref) is unique). A repost by
// a person already known by email (people repost monthly) adds an evidence row to the
// existing prospect instead of a duplicate. Existing prospects are not overwritten.
//
// Usage: node scripts/hn-hiring-connector.mjs                 # dry run, latest thread
//        node scripts/hn-hiring-connector.mjs --threads=3     # dry run, latest 3 threads
//        node scripts/hn-hiring-connector.mjs --write         # insert (needs SUPABASE_URL,
//                                                             #   SUPABASE_SERVICE_ROLE_KEY)

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

export const SOURCE = 'hn_who_wants_to_be_hired';
export const SIGNAL_TYPE = 'self_posted_seeking_work';
const THREAD_TITLE_PREFIX = 'Ask HN: Who wants to be hired?';
const ALGOLIA = 'https://hn.algolia.com/api/v1';
const FIREBASE = 'https://hacker-news.firebaseio.com/v0';
const REQUEST_INTERVAL_MS = 1000;
const SNIPPET_LENGTH = 500;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HN comment HTML -> plain text. Links become their full href (HN truncates long link
 * text), mailto: links become the bare address, <p> becomes a blank line. */
export function htmlToText(html) {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<a\s[^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>/gi, (_, href) => decodeEntities(href).replace(/^mailto:/i, ''))
      .replace(/<p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Fields ("Label: value" lines, the thread's suggested format)
// ---------------------------------------------------------------------------

const FIELD_LABELS = {
  location: 'location',
  remote: 'remote',
  relocate: 'willing to relocate|relocation|relocate',
  technologies: 'technologies|tech stack|stack|skills',
  resume: 'r[eé]sum[eé]\\s*/\\s*cv|r[eé]sum[eé]|cv',
  email: 'e-?mail|contact',
};
const ANY_LABEL = Object.values(FIELD_LABELS).join('|');
// "Label: value", "Label - value" (spaced dash only, so "Remote-first" isn't a field).
const SEPARATOR = '\\s*(?:\\([^)]*\\))?\\s*(?::|\\s[-–—]\\s)\\s*';
const SEGMENT_SPLIT = new RegExp(`\\s*[;|]\\s*(?=(?:${ANY_LABEL})${SEPARATOR})`, 'i');

/** First value per known field. Several fields on one line ("Location: X; Remote: Y") are
 * split only where the next part starts with another known label. */
export function extractFields(text) {
  const fields = {};
  for (const line of text.split('\n')) {
    for (const segment of line.split(SEGMENT_SPLIT)) {
      for (const [field, labels] of Object.entries(FIELD_LABELS)) {
        if (fields[field] !== undefined) continue;
        const m = segment.match(new RegExp(`^\\s*(?:[-*•·]\\s*)?(?:${labels})${SEPARATOR}(.*)$`, 'i'));
        if (!m) continue;
        // "Technologies: Technologies: ..." -> drop the repeated label
        const value = m[1].replace(new RegExp(`^(?:${labels})${SEPARATOR}`, 'i'), '').trim();
        if (value) fields[field] = value;
        break;
      }
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Email: only what's written, obfuscation decoded, never guessed
// ---------------------------------------------------------------------------

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;

/** "name [at] domain [dot] com", "name (at) domain.com", "name at domain dot com" -> address,
 * or null if what's left isn't a complete address (e.g. "name at gmail"). */
export function decodeEmail(value) {
  if (!value) return null;
  const AT = '(?:at|@|at[- ]?sign|at[- ]?symbol)';
  const DOT = '(?:dot|\\.|period)';
  const decoded = value
    .replace(new RegExp(`\\s*[[({<]\\s*${AT}\\s*[\\])}>]\\s*`, 'gi'), '@') // [at] (at) {at} <at> [at-symbol]
    .replace(new RegExp(`\\s*[[({<]\\s*${DOT}\\s*[\\])}>]\\s*`, 'gi'), '.')
    .replace(new RegExp(`\\s*:\\s*${AT}\\s*:\\s*`, 'gi'), '@') // :at:
    .replace(new RegExp(`\\s*:\\s*${DOT}\\s*:\\s*`, 'gi'), '.')
    .replace(/\s+at[- ]?(?:sign|symbol)\s+/gi, '@') // at-sign, at symbol
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s+dot\s+/gi, '.');
  const m = decoded.match(EMAIL_RE);
  return m ? m[0] : null;
}

/** Email field (decoded) first; otherwise a plain, unobfuscated address anywhere in the post. */
export function findEmail(text, fields) {
  if (fields.email) {
    const fromField = decodeEmail(fields.email);
    if (fromField) return fromField;
  }
  const plain = text.match(EMAIL_RE);
  return plain ? plain[0] : null;
}

export function maskEmail(email) {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  return at <= 0 ? '***' : `${email[0]}***${email.slice(at)}`;
}

// ---------------------------------------------------------------------------
// Location -> country (US only when clear) and remote
// ---------------------------------------------------------------------------

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida',
  'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine',
  'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska',
  'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas',
  'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia',
];
const US_STATE_CODES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
const US_CITIES = [
  'NYC', 'New York City', 'Brooklyn', 'Manhattan', 'San Francisco', 'SF Bay Area', 'Bay Area', 'Silicon Valley',
  'Los Angeles', 'Seattle', 'Boston', 'Chicago', 'Austin', 'Denver', 'Boulder', 'Portland', 'San Diego',
  'San Jose', 'Oakland', 'Palo Alto', 'Mountain View', 'Sunnyvale', 'Atlanta', 'Miami', 'Dallas', 'Houston',
  'Philadelphia', 'Phoenix', 'Pittsburgh', 'Minneapolis', 'Detroit', 'Nashville', 'Raleigh', 'Salt Lake City',
  'Washington DC', 'Washington, DC', 'Washington D.C.', 'Columbus', 'Indianapolis', 'Charlotte', 'Baltimore',
  'St. Louis', 'St Louis', 'Kansas City', 'Las Vegas', 'Sacramento', 'Orlando', 'Tampa', 'Ann Arbor', 'Madison',
];
// Places that make a location not-clearly-US even if a US token also appears
// ("Berlin, open to US", "EU/US hours", "Tbilisi, Georgia").
const NON_US = [
  'Canada', 'Toronto', 'Vancouver', 'Montreal', 'Mexico', 'Brazil', 'Argentina', 'Colombia', 'Chile', 'Peru',
  'Uruguay', 'Costa Rica', 'LATAM', 'UK', 'U.K.', 'United Kingdom', 'England', 'Scotland', 'London', 'Ireland',
  'Dublin', 'Germany', 'Berlin', 'Munich', 'France', 'Paris', 'Spain', 'Madrid', 'Barcelona', 'Portugal', 'Lisbon',
  'Italy', 'Netherlands', 'Amsterdam', 'Belgium', 'Switzerland', 'Zurich', 'Austria', 'Vienna', 'Poland',
  'Czechia', 'Czech Republic', 'Prague', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Serbia', 'Croatia',
  'Slovenia', 'Greece', 'Ukraine', 'Russia', 'Belarus', 'Lithuania', 'Latvia', 'Estonia', 'Sweden', 'Stockholm',
  'Norway', 'Denmark', 'Copenhagen', 'Finland', 'Helsinki', 'Europe', 'EU', 'EMEA', 'APAC', 'Turkey', 'Israel',
  'Tel Aviv', 'Tbilisi', 'Armenia', 'India', 'Bangalore', 'Bengaluru', 'Pakistan', 'Bangladesh', 'Sri Lanka',
  'Nepal', 'China', 'Japan', 'Tokyo', 'Korea', 'Taiwan', 'Hong Kong', 'Singapore', 'Malaysia', 'Thailand',
  'Vietnam', 'Indonesia', 'Philippines', 'Australia', 'Sydney', 'Melbourne', 'New Zealand', 'UAE', 'Dubai',
  'Saudi', 'Egypt', 'Morocco', 'Tunisia', 'Nigeria', 'Ghana', 'Kenya', 'Ethiopia', 'South Africa', 'Iran',
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordsRe = (list, flags = 'i') => new RegExp(`(?<![A-Za-z])(?:${list.map(escapeRe).join('|')})(?![A-Za-z])`, flags);
const US_STATE_RE = wordsRe(US_STATES);
const US_CITY_RE = wordsRe(US_CITIES);
const US_CODE_AFTER_COMMA_RE = new RegExp(`,\\s*(?:${US_STATE_CODES})(?![A-Za-z])`);
// Case-sensitive on purpose: "us" the word is not the US.
const US_COUNTRY_CASE_SENSITIVE_RE = /(?<![A-Za-z])(?:USA|US|U\.S\.A?\.?)(?![A-Za-z])/;
const NON_US_RE = wordsRe(NON_US.filter((p) => p !== 'UK' && p !== 'EU'));
const NON_US_UPPER_RE = /(?<![A-Za-z])(?:UK|EU)(?![A-Za-z])/;

/** 'US' when the Location field clearly is the US, otherwise null. */
export function detectCountry(location) {
  if (!location) return null;
  const usCountry = US_COUNTRY_CASE_SENSITIVE_RE.test(location) || /united states/i.test(location);
  const hasUs = usCountry || US_STATE_RE.test(location) || US_CITY_RE.test(location) || US_CODE_AFTER_COMMA_RE.test(location);
  const hasNonUs = NON_US_RE.test(location) || NON_US_UPPER_RE.test(location);
  return hasUs && !hasNonUs ? 'US' : null;
}

/** true / false from the Remote field; if there's none, true when the location says remote. */
export function parseRemote(remoteField, location) {
  if (remoteField) {
    if (/^(?:yes|y\b|true|open|ok|okay|sure|preferred|prefer|only|remote|fully|full|100|either|both|hybrid)/i.test(remoteField)) return true;
    if (/^(?:no\b|n\b|false|not\b|on-?site only|onsite only)/i.test(remoteField)) return false;
    return null;
  }
  return location && /(?<![A-Za-z])remote(?![A-Za-z])/i.test(location) ? true : null;
}

// ---------------------------------------------------------------------------
// One comment -> parsed post
// ---------------------------------------------------------------------------

export function parseComment(comment) {
  const text = htmlToText(comment.text);
  const fields = extractFields(text);
  const location = fields.location ?? null;
  const email = findEmail(text, fields);
  const hasProfileFields = Boolean(fields.location || fields.remote || fields.technologies || fields.resume || fields.email || email);
  return {
    id: String(comment.id),
    author: comment.author ?? null,
    createdAt: comment.created_at ?? (comment.created_at_i ? new Date(comment.created_at_i * 1000).toISOString() : null),
    text,
    fields,
    email,
    country: detectCountry(location),
    openToRemote: parseRemote(fields.remote, location),
    preferredLocations: location && !/^remote\b/i.test(location) ? [location.slice(0, 200)] : null,
    hasProfileFields,
  };
}

/** Which comments to keep, and why the rest were skipped. */
export function selectPosts(children) {
  const posts = [];
  const skipped = { deleted_or_no_text: 0, no_profile_fields: 0 };
  for (const child of children) {
    if (!child?.author || !child?.text) {
      skipped.deleted_or_no_text += 1;
      continue;
    }
    const post = parseComment(child);
    if (!post.hasProfileFields) {
      skipped.no_profile_fields += 1;
      continue;
    }
    posts.push(post);
  }
  return { posts, skipped };
}

export function toProspectRow(post) {
  return {
    kind: 'job_seeker',
    source: SOURCE,
    source_ref: post.id,
    first_name: post.author,
    email: post.email,
    country: post.country,
    open_to_remote: post.openToRemote,
    preferred_locations: post.preferredLocations,
  };
}

export function toEvidenceRow(post, prospectId) {
  return {
    prospect_id: prospectId,
    url: `https://news.ycombinator.com/item?id=${post.id}`,
    snippet: post.text.replace(/\s+/g, ' ').slice(0, SNIPPET_LENGTH),
    found_at: post.createdAt,
    source: SOURCE,
    signal_type: SIGNAL_TYPE,
  };
}

// ---------------------------------------------------------------------------
// HN API (1 request per second)
// ---------------------------------------------------------------------------

let lastRequestAt = 0;
async function getJson(url) {
  const wait = lastRequestAt + REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function findThreads(count) {
  const params = new URLSearchParams({
    tags: 'story,author_whoishiring',
    query: '"who wants to be hired"',
    hitsPerPage: String(Math.max(count * 3, 10)),
  });
  const data = await getJson(`${ALGOLIA}/search_by_date?${params}`);
  return data.hits
    .filter((h) => h.author === 'whoishiring' && h.title?.startsWith(THREAD_TITLE_PREFIX))
    .slice(0, count)
    .map((h) => ({ id: h.objectID, title: h.title, createdAt: h.created_at }));
}

async function loadThread(thread) {
  const tree = await getJson(`${ALGOLIA}/items/${thread.id}`);
  const item = await getJson(`${FIREBASE}/item/${thread.id}.json`);
  const children = tree.children ?? [];
  const deadDeletedOrFlagged = Math.max(0, (item?.kids?.length ?? children.length) - children.length);
  return { children, deadDeletedOrFlagged };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const norm = (e) => (e ? e.trim().toLowerCase() : null);

async function writePosts(supabase, posts) {
  const idByRef = new Map();
  const idByEmail = new Map();
  for (const refs of chunk(posts.map((p) => p.id), 200)) {
    const { data, error } = await supabase.from('prospects').select('id, source_ref').eq('source', SOURCE).in('source_ref', refs);
    if (error) throw new Error(`Failed to read existing prospects: ${error.message}`);
    for (const r of data) idByRef.set(r.source_ref, r.id);
  }
  const emails = [...new Set(posts.map((p) => norm(p.email)).filter(Boolean))];
  for (const batch of chunk(emails, 200)) {
    const { data, error } = await supabase.from('prospects').select('id, email_normalized').in('email_normalized', batch);
    if (error) throw new Error(`Failed to read prospects by email: ${error.message}`);
    for (const r of data) idByEmail.set(r.email_normalized, r.id);
  }

  let inserted = 0;
  let linkedToExisting = 0;
  const pendingEmails = new Set();
  const toInsert = [];
  for (const post of posts) {
    if (idByRef.has(post.id)) continue;
    const e = norm(post.email);
    if (e && (idByEmail.has(e) || pendingEmails.has(e))) continue; // evidence attaches below
    if (e) pendingEmails.add(e);
    toInsert.push(post);
  }

  for (const batch of chunk(toInsert, 100)) {
    const { data, error } = await supabase.from('prospects').insert(batch.map(toProspectRow)).select('id, source_ref, email_normalized');
    if (!error) {
      for (const r of data) {
        idByRef.set(r.source_ref, r.id);
        if (r.email_normalized) idByEmail.set(r.email_normalized, r.id);
      }
      inserted += data.length;
      continue;
    }
    // A conflict (e.g. the email was added from another source meanwhile): row by row.
    for (const post of batch) {
      const { data: row, error: rowError } = await supabase.from('prospects').insert(toProspectRow(post)).select('id, email_normalized').single();
      if (!rowError) {
        idByRef.set(post.id, row.id);
        if (row.email_normalized) idByEmail.set(row.email_normalized, row.id);
        inserted += 1;
      } else if (rowError.code !== '23505') {
        throw new Error(`Failed to insert prospect for comment ${post.id}: ${rowError.message}`);
      }
    }
  }

  const evidence = [];
  for (const post of posts) {
    const id = idByRef.get(post.id) ?? idByEmail.get(norm(post.email));
    if (!id) continue;
    if (!idByRef.has(post.id)) linkedToExisting += 1;
    evidence.push(toEvidenceRow(post, id));
  }
  for (const batch of chunk(evidence, 200)) {
    const { error } = await supabase.from('prospect_evidence').upsert(batch, { onConflict: 'prospect_id,url', ignoreDuplicates: true });
    if (error) throw new Error(`Failed to upsert prospect_evidence: ${error.message}`);
  }
  return { inserted, linkedToExisting, evidence: evidence.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  const write = process.argv.includes('--write');
  const threadsArg = process.argv.find((a) => a.startsWith('--threads='));
  const threadCount = threadsArg ? Number(threadsArg.slice('--threads='.length)) : 1;
  if (!Number.isInteger(threadCount) || threadCount < 1) throw new Error('--threads must be a positive integer');
  const supabase = write
    ? createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
    : null;

  const threads = await findThreads(threadCount);
  if (threads.length === 0) throw new Error('No "Who wants to be hired?" threads found');
  console.log(`${write ? 'WRITE' : 'DRY RUN (nothing written; pass --write to insert)'}: ${threads.length} thread(s)`);

  const allPosts = [];
  const skipped = { dead_deleted_or_flagged: 0, deleted_or_no_text: 0, no_profile_fields: 0 };
  for (const thread of threads) {
    const { children, deadDeletedOrFlagged } = await loadThread(thread);
    const { posts, skipped: s } = selectPosts(children);
    skipped.dead_deleted_or_flagged += deadDeletedOrFlagged;
    skipped.deleted_or_no_text += s.deleted_or_no_text;
    skipped.no_profile_fields += s.no_profile_fields;
    allPosts.push(...posts);
    console.log(`  ${thread.title} (id ${thread.id}): ${children.length} top-level comments returned, ${posts.length} parsed`);
  }

  const counts = {
    total: allPosts.length,
    with_email: allPosts.filter((p) => p.email).length,
    us: allPosts.filter((p) => p.country === 'US').length,
    remote: allPosts.filter((p) => p.openToRemote === true).length,
    skipped,
  };
  console.log('\nCounts:');
  console.log(JSON.stringify(counts, null, 2));

  console.log('\nSamples (email masked):');
  for (const p of allPosts.slice(0, 5)) {
    console.log(JSON.stringify({
      comment: p.id,
      author: p.author,
      location: p.fields.location ?? null,
      country: p.country,
      open_to_remote: p.openToRemote,
      email: maskEmail(p.email),
      technologies: p.fields.technologies ? p.fields.technologies.slice(0, 80) : null,
      has_resume: Boolean(p.fields.resume),
    }));
  }

  if (write) {
    const result = await writePosts(supabase, allPosts);
    console.log(`\nWritten: ${result.inserted} new prospects, ${result.linkedToExisting} posts linked to an existing prospect by email, ${result.evidence} evidence rows upserted.`);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
