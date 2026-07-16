#!/usr/bin/env node
// Extracts the 55-article chatbot knowledge base (src/data/knowledgeBaseMaster.md)
// into public/support-docs.json under source_doc "kb_master".
//
// Merges into whatever extract-support-docs.mjs already wrote: existing
// kb_master rows are dropped and re-added, so re-running is idempotent.
//
// NOTE ON ORDERING: extract-support-docs.mjs rewrites support-docs.json from
// scratch and does not know about kb_master, so it must run BEFORE this script.
// Use `npm run extract-all`, which runs both in the safe order — running
// `extract-docs:base` on its own drops every kb_master article.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const SOURCE_DOC = 'kb_master'
const kbPath = path.join(root, 'src', 'data', 'knowledgeBaseMaster.md')
const outPath = path.join(root, 'public', 'support-docs.json')

// Every section heading that appears on its own line inside an article. Used
// only to find where a section ends — the heading after the one we want.
const SECTION_HEADINGS = new Set([
  'Purpose',
  'Summary',
  'Detailed Explanation',
  'Key Benefits',
  'Examples',
  'FAQs',
  'Related Articles',
  'Training AI',
  'Canonical Response',
  'Related Intents',
  'AI Do Rules',
  "AI Don't Rules",
  'Sales Opportunity',
  'Escalation Rules',
  'Required Ticket Payload',
  'Internal Notes',
])

// Articles with no metadata block whose status we assert explicitly, because
// their subject matter is known and the phrase scan below would get it wrong.
const STATUS_OVERRIDES = {
  // Premium is not purchasable yet — must be flagged despite having no metadata.
  'KB-0038': { ai_approved: 'Conditional', live_state: 'Planned' },
  // Describes today's shipped sponsorship heuristic, not the future Real Score.
  'KB-0033': { ai_approved: 'Yes', live_state: 'Live' },
  // Mostly covers live Free/Core pricing; only mentions Premium's waitlist in
  // passing, so the phrase scan would wrongly condemn the whole article.
  'KB-0008': { ai_approved: 'Yes', live_state: 'Live' },
}

// Heuristic fallback for legacy articles with no metadata block: if the article
// talks about something unreleased, treat it as not-live. Deliberately blunt —
// the run summary lists every hit so they can be sanity-checked.
const NOT_LIVE_PHRASES = [
  'not yet',
  'not live',
  'coming soon',
  'waitlist',
  'planned',
  'in development',
  'not purchasable',
]

// The doc uses curly apostrophes ("AI Don't Rules"); compare on straight ones.
const normalizeHeading = (line) => line.replace(/[‘’]/g, "'").trim()

const isHeading = (line) => SECTION_HEADINGS.has(normalizeHeading(line))

// The source hard-wraps hyphenated words across line breaks ("Job-" / "Hopper",
// "work-" / "authorization"), which the line-join below turns into "Job- Hopper".
// Rejoin those, but leave shared-hyphen list constructions ("Free- and Core-tier")
// alone — there the hyphen is intentional, not a wrap.
//
// Matches only "<letter>-<space>" and asserts a following letter via lookahead
// rather than consuming it, so back-to-back wraps are all caught. Horizontal
// whitespace only, so a paragraph break can never be swallowed.
const WRAPPED_HYPHEN = /([A-Za-z])-[ \t]+(?!and\b)(?!or\b)(?=[A-Za-z])/gi

let dehyphenated = 0

function rejoinWrappedWords(text) {
  return text.replace(WRAPPED_HYPHEN, (_match, letter) => {
    dehyphenated += 1
    return `${letter}-`
  })
}

// Source paragraphs are hard-wrapped at ~100 chars. Unwrap them: join the lines
// of each paragraph with a space, keep blank-line paragraph breaks. Matches the
// single-line-per-paragraph shape the other extractor emits.
function normalizeBlock(lines) {
  const paragraphs = []
  let current = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (current.length) paragraphs.push(current.join(' '))
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length) paragraphs.push(current.join(' '))
  return rejoinWrappedWords(paragraphs.join('\n\n').replace(/\s+\n/g, '\n')).trim()
}

// Returns the lines under `heading`, stopping at the next section heading.
function sectionLines(lines, heading) {
  const start = lines.findIndex((l) => normalizeHeading(l) === heading)
  if (start === -1) return null
  const body = []
  for (let i = start + 1; i < lines.length; i++) {
    if (isHeading(lines[i])) break
    body.push(lines[i])
  }
  return body
}

function section(lines, heading) {
  const body = sectionLines(lines, heading)
  return body === null ? null : normalizeBlock(body)
}

// `Field: value` from the metadata block. Only KB-0051..KB-0055 carry one.
function metaField(lines, field) {
  const re = new RegExp(`^${field}:\\s*(.+)$`)
  for (const line of lines) {
    const m = line.match(re)
    if (m) return m[1].trim()
  }
  return null
}

// ---------- parse ----------

const source = readFileSync(kbPath, 'utf8')
const lines = source.split('\n')

// Article headers look like "KB-0038 - Premium Plan and Waitlist" at line start.
// The preamble's "KB-0001 to KB-0050" prose does not match (no " - " separator).
const headerRe = /^KB-(\d{4}) - (.+)$/
const starts = []
lines.forEach((line, i) => {
  const m = line.match(headerRe)
  if (m) starts.push({ index: i, id: `KB-${m[1]}`, title: m[2].trim() })
})

const articles = starts.map((start, i) => {
  const end = i + 1 < starts.length ? starts[i + 1].index : lines.length
  return { ...start, lines: lines.slice(start.index + 1, end) }
})

const entries = []
const problems = []
const scanFlagged = []

for (const article of articles) {
  const summary = section(article.lines, 'Summary')
  const detailed = section(article.lines, 'Detailed Explanation')
  const canonical = section(article.lines, 'Canonical Response')

  for (const [name, value] of [
    ['Summary', summary],
    ['Detailed Explanation', detailed],
    ['Canonical Response', canonical],
  ]) {
    if (!value) problems.push(`${article.id}: missing ${name}`)
  }

  // Article ID comes from the metadata block when present, otherwise from the
  // header — which always carries it, so this never guesses.
  const articleId = metaField(article.lines, 'Article ID') ?? article.id
  const metaAiApproved = metaField(article.lines, 'AI Approved')
  const metaLiveState = metaField(article.lines, 'Live State')

  // Precedence: explicit override > metadata block (KB-0051..0055) > phrase scan.
  let aiApproved
  let liveState
  const override = STATUS_OVERRIDES[article.id]
  if (override) {
    aiApproved = override.ai_approved
    liveState = override.live_state
  } else if (metaAiApproved !== null || metaLiveState !== null) {
    aiApproved = metaAiApproved
    liveState = metaLiveState
  } else {
    const haystack = article.lines.join('\n').toLowerCase()
    const hits = NOT_LIVE_PHRASES.filter((p) => haystack.includes(p))
    if (hits.length) {
      aiApproved = 'Conditional'
      liveState = 'Planned'
      scanFlagged.push({ id: article.id, title: article.title, hits })
    } else {
      aiApproved = 'Yes'
      liveState = 'Live'
    }
  }

  let content = [canonical, summary, detailed].filter(Boolean).join('\n\n')

  const notLive = aiApproved === 'No' || liveState === 'Planned' || liveState === 'Proposed'
  if (notLive) {
    content = `[NOT YET LIVE - do not present as available]\n\n${content}`
  }

  entries.push({
    source_doc: SOURCE_DOC,
    title: `${articleId} ${article.title}`,
    content,
    ai_approved: aiApproved,
    live_state: liveState,
  })
}

// ---------- merge ----------

let existing = []
try {
  existing = JSON.parse(readFileSync(outPath, 'utf8'))
} catch {
  problems.push(`${path.relative(root, outPath)} not found or unparseable — writing kb_master only`)
}

const kept = existing.filter((e) => e.source_doc !== SOURCE_DOC)
const merged = [...kept, ...entries]
writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n')

// ---------- summary ----------

const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length

const flagged = entries.filter((e) => e.content.startsWith('[NOT YET LIVE'))
const words = entries.reduce((n, e) => n + wordCount(e.title) + wordCount(e.content), 0)

const tally = (key) =>
  Object.entries(
    entries.reduce((acc, e) => {
      const k = String(e[key])
      acc[k] = (acc[k] ?? 0) + 1
      return acc
    }, {}),
  )
    .map(([k, n]) => `${k}=${n}`)
    .join('  ')

console.log(`Parsed ${entries.length} articles from ${path.relative(root, kbPath)}`)
console.log(`  ai_approved: ${tally('ai_approved')}`)
console.log(`  live_state:  ${tally('live_state')}`)
console.log(`  flagged NOT YET LIVE: ${flagged.length} (${flagged.map((e) => e.title.split(' ')[0]).join(', ')})`)
console.log(`  wrapped-hyphen words rejoined: ${dehyphenated}`)
console.log(`  word count: ${words}`)

if (scanFlagged.length) {
  console.log(`\nFlagged by phrase scan (${scanFlagged.length}) — sanity-check these:`)
  for (const s of scanFlagged) {
    console.log(`  ${s.id} ${s.title}`)
    console.log(`      matched: ${s.hits.map((h) => `"${h}"`).join(', ')}`)
  }
}
console.log(
  `\nMerged into ${path.relative(root, outPath)}: ` +
    `${kept.length} existing + ${entries.length} kb_master = ${merged.length} total`,
)

if (problems.length) {
  console.log(`\nWARNINGS (${problems.length}):`)
  for (const p of problems) console.log(`  - ${p}`)
}
