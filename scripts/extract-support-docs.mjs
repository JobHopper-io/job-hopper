#!/usr/bin/env node
// Extracts user-facing documentation copy (FAQ, pricing FAQ, methodology,
// terms, privacy, chatbot KB) into public/support-docs.json.
//
// Tailored to the exact structure of the source files below rather than a
// general Vue/HTML/TS parser — see CLAUDE.md docs/architecture notes on
// data-access layering for why these are plain view components with no
// API-backed copy (aside from the two resume add-on fields we skip).

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const viewsPath = (p) => path.join(root, 'src', 'views', p)
const dataPath = (p) => path.join(root, 'src', 'data', p)
const read = (p) => readFileSync(viewsPath(p), 'utf8')
const readData = (p) => readFileSync(dataPath(p), 'utf8')

// ---------- generic helpers ----------

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripInline(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

// Strips tags to plain text, turning <li> into "- item" lines and
// paragraph/heading/div boundaries into blank-line-separated paragraphs.
function stripHtml(html) {
  let text = html
  text = text.replace(/<li[^>]*>/g, '\n\x01 ')
  text = text.replace(/<\/(p|div|section|h1|h2|h3|li|ul|ol)>/g, '\n')
  text = text.replace(/<br\s*\/?>/g, '\n')
  text = text.replace(/<[^>]+>/g, '')
  text = decodeEntities(text)

  const rawLines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim())
  const out = []
  for (const raw of rawLines) {
    if (!raw) continue
    const isBullet = raw.startsWith('\x01')
    const line = isBullet ? `- ${raw.slice(1).trim()}` : raw
    if (out.length === 0) {
      out.push(line)
      continue
    }
    const prevBullet = out[out.length - 1].startsWith('- ')
    if (isBullet && prevBullet) out.push(line)
    else out.push('', line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function extractHeadingAndBody(html, headingTag) {
  const re = new RegExp(`<${headingTag}[^>]*>([\\s\\S]*?)<\\/${headingTag}>`)
  const m = html.match(re)
  if (!m) return { title: null, body: stripHtml(html) }
  const title = stripInline(m[1])
  const body = stripHtml(html.slice(m.index + m[0].length))
  return { title, body }
}

function sectionBetween(source, startMarker, endMarker) {
  const startIdx = source.indexOf(startMarker)
  if (startIdx === -1) throw new Error(`marker not found: ${startMarker}`)
  const contentStart = startIdx + startMarker.length
  const endIdx = endMarker ? source.indexOf(endMarker, contentStart) : source.length
  if (endMarker && endIdx === -1) throw new Error(`marker not found: ${endMarker}`)
  return source.slice(contentStart, endIdx)
}

// Removes elements carrying a v-for attribute (their content duplicates a
// JS array already extracted separately). Only safe for non-nested tags,
// which holds for every block this is used on here.
function removeVForBlocks(html) {
  return html.replace(/<(\w[\w-]*)[^>]*\sv-for=[^>]*>[\s\S]*?<\/\1>\s*/g, '')
}

// Extracts a top-level `const NAME = [...]` (or `const NAME: T = [...]`)
// array literal as real JS values, tolerant of a TS type annotation before
// the `=`. Only works for literals containing plain data (no functions),
// which is true for every array pulled out below.
function extractArrayLiteral(source, varName) {
  const declIdx = source.indexOf(`const ${varName}`)
  if (declIdx === -1) throw new Error(`${varName} not found`)
  const eqIdx = source.indexOf('=', declIdx)
  let i = eqIdx + 1
  while (/\s/.test(source[i])) i++
  if (source[i] !== '[') throw new Error(`${varName}: expected array literal after =`)
  const start = i
  let depth = 0
  for (; i < source.length; i++) {
    const ch = source[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        i++
        break
      }
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i++
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i++
        i++
      }
    }
  }
  const arrayText = source.slice(start, i)
  return new Function(`return (${arrayText});`)()
}

// ---------- per-file extractors ----------

function extractFaq() {
  const source = read('FAQ.vue')
  const faqs = extractArrayLiteral(source, 'faqs')
  return faqs.map((f) => ({ source_doc: 'faq', title: f.q, content: f.a }))
}

function extractPricingFaq() {
  const source = read('Pricing.vue')
  const entries = []

  const pricingFaq = extractArrayLiteral(source, 'pricingFaq')
  for (const f of pricingFaq) {
    entries.push({ source_doc: 'pricing_faq', title: f.q, content: f.a })
  }

  // Intro copy (static, above the tier cards).
  const introHtml = sectionBetween(source, '<!-- Intro -->', '<!-- Tiers -->')
  const intro = extractHeadingAndBody(introHtml, 'h1')
  entries.push({ source_doc: 'pricing_faq', title: intro.title, content: intro.body })

  // Free / Core tiers — static data, no live product lookups.
  const sellableTiers = extractArrayLiteral(source, 'sellableTiers')
  for (const tier of sellableTiers) {
    const featureLines = tier.features
      .map((f) => `${f.included ? '✓' : '✗'} ${f.label}`)
      .join('\n')
    entries.push({
      source_doc: 'pricing_faq',
      title: `${tier.name} plan`,
      content: `${tier.price}/month. ${tier.note}\n\n${featureLines}`,
    })
  }

  // Premium tier card — price/description text is hardcoded in the
  // template (not purchasable yet); feature list comes from the JS array.
  const premiumFeatures = extractArrayLiteral(source, 'premiumFeatures')
  const premiumHtml = sectionBetween(
    source,
    '<!-- Premium (locked / not yet buyable) -->',
    '<!-- Feature comparison -->',
  )
  const premium = extractHeadingAndBody(removeVForBlocks(premiumHtml), 'h3')
  const premiumFeatureLines = premiumFeatures.map((f) => `- ${f}`).join('\n')
  entries.push({
    source_doc: 'pricing_faq',
    title: premium.title ?? 'Premium plan',
    content: `${premium.body}\n\nEverything in Core, plus:\n${premiumFeatureLines}`,
  })

  // Feature comparison table.
  const comparisonRows = extractArrayLiteral(source, 'comparisonRows')
  const comparisonColumns = extractArrayLiteral(source, 'comparisonColumns')
  const comparisonLines = comparisonRows.map(
    (row) => `${row.feature}: ${row.cells.map((c) => (c === true ? 'Yes' : c === false ? 'No' : c)).join(' / ')}`,
  )
  entries.push({
    source_doc: 'pricing_faq',
    title: `Feature comparison (${comparisonColumns.join(' / ')})`,
    content: comparisonLines.join('\n'),
  })

  // Reassurance strip (static prose + hardcoded checklist, no v-for).
  const reassuranceHtml = sectionBetween(source, '<!-- Reassurance Strip -->', '<!-- Pricing FAQ -->')
  const reassurance = extractHeadingAndBody(reassuranceHtml, 'h2')
  entries.push({ source_doc: 'pricing_faq', title: reassurance.title, content: reassurance.body })

  return entries
}

function extractMethodology() {
  const source = read('HowItWorks.vue')
  const entries = []

  const introHtml = sectionBetween(source, '<!-- Intro -->', '<!-- Steps -->')
  const intro = extractHeadingAndBody(introHtml, 'h1')
  entries.push({ source_doc: 'methodology', title: intro.title, content: intro.body })

  const steps = extractArrayLiteral(source, 'steps')
  for (const step of steps) {
    const parts = []
    if (step.lead) parts.push(step.lead)
    if (step.points) parts.push(step.points.map((p) => `- ${p}`).join('\n'))
    if (step.premium) parts.push(`On Premium (rolling out): ${step.premium}.`)
    if (step.footer) parts.push(step.footer)
    const title = step.aside ? `${step.title} (${step.aside})` : step.title
    entries.push({ source_doc: 'methodology', title, content: parts.join('\n\n') })
  }

  const controls = extractArrayLiteral(source, 'controls')
  const philoHtml = sectionBetween(source, '<!-- Matching philosophy -->', '<!-- Sponsorship note -->')
  const philo = extractHeadingAndBody(removeVForBlocks(philoHtml), 'h2')
  entries.push({
    source_doc: 'methodology',
    title: philo.title,
    content: `${philo.body}\n\n${controls.map((c) => `- ${c}`).join('\n')}`,
  })

  const sponsorHtml = sectionBetween(source, '<!-- Sponsorship note -->', '<!-- Data & privacy -->')
  const sponsor = extractHeadingAndBody(sponsorHtml, 'h2')
  entries.push({ source_doc: 'methodology', title: sponsor.title, content: sponsor.body })

  const privacy = extractArrayLiteral(source, 'privacy')
  const dataHtml = sectionBetween(source, '<!-- Data & privacy -->', '<!-- CTA -->')
  const data = extractHeadingAndBody(removeVForBlocks(dataHtml), 'h2')
  entries.push({
    source_doc: 'methodology',
    title: data.title,
    content: privacy.map((p) => `- ${p}`).join('\n'),
  })

  return entries
}

// Shared shape for Terms.vue / Privacy.vue: an intro <p>, a run of
// `<section class="space-y-3">` blocks each starting with an <h2>, and a
// trailing <p> pointing at Support.
function extractLegalDoc(fileName, sourceDocTag) {
  const source = read(fileName)
  const templateMatch = source.match(/<template>([\s\S]*)<\/template>/)
  const template = templateMatch[1]
  const entries = []

  const h1Match = template.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  const docTitle = h1Match ? stripInline(h1Match[1]) : sourceDocTag

  const introMatch = template.match(/<div class="text-neutral-body space-y-6">([\s\S]*?)<section/)
  if (introMatch) {
    const introText = stripHtml(introMatch[1])
    if (introText) entries.push({ source_doc: sourceDocTag, title: docTitle, content: introText })
  }

  const sectionRe = /<section class="space-y-3">([\s\S]*?)<\/section>/g
  let m
  let lastIndex = 0
  while ((m = sectionRe.exec(template))) {
    const { title, body } = extractHeadingAndBody(m[1], 'h2')
    entries.push({
      source_doc: sourceDocTag,
      title: (title ?? docTitle).replace(/^\d+\.\s*/, ''),
      content: body,
    })
    lastIndex = sectionRe.lastIndex
  }

  const trailingText = stripHtml(template.slice(lastIndex))
  if (trailingText) {
    entries.push({ source_doc: sourceDocTag, title: `${docTitle} - Additional Notes`, content: trailingText })
  }

  return entries
}

// RAG-chatbot-only knowledge base — plain TS data module, not a Vue view.
function extractChatbotKb() {
  const source = readData('chatbotKnowledge.ts')
  const chatbotKnowledge = extractArrayLiteral(source, 'chatbotKnowledge')
  return chatbotKnowledge.map((f) => ({ source_doc: 'chatbot_kb', title: f.q, content: f.a }))
}

// ---------- run ----------

// faq / pricing_faq / methodology are intentionally not emitted. They were
// retired because their content OVERLAPS kb_master (see extract-kb-master.mjs),
// not because it was wrong:
//   - methodology -> KB-0007 (How Job-Hopper Works), KB-0017 (How Jobs Are Collected)
//   - pricing_faq -> KB-0008 (Plans and Pricing Overview), KB-0036/0037/0038
//                    (Free / Core / Premium plans)
//   - faq         -> the rest overlaps kb_master's account/product articles
// Duplicate sources give the retrieval layer conflicting answers, so only one
// should win. Their extractors are deliberately kept below: reinstating any
// source just means adding it back to the `entries` output list in this file.
const entries = [
  ...extractLegalDoc('Terms.vue', 'terms'),
  ...extractLegalDoc('Privacy.vue', 'privacy'),
  ...extractChatbotKb(),
]

const outPath = path.join(root, 'public', 'support-docs.json')
writeFileSync(outPath, JSON.stringify(entries, null, 2) + '\n')

// ---------- summary ----------

const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length

const bySource = new Map()
for (const e of entries) {
  const stats = bySource.get(e.source_doc) ?? { count: 0, words: 0 }
  stats.count += 1
  stats.words += wordCount(e.title) + wordCount(e.content)
  bySource.set(e.source_doc, stats)
}

console.log(`Wrote ${entries.length} entries to ${path.relative(root, outPath)}\n`)
console.log('Per source_doc:')
let totalWords = 0
for (const [doc, stats] of bySource) {
  console.log(`  ${doc}: ${stats.count} entries, ${stats.words} words`)
  totalWords += stats.words
}
console.log(`\nTotal word count: ${totalWords}`)

console.log('\nFirst 2 entries:')
console.log(JSON.stringify(entries.slice(0, 2), null, 2))
