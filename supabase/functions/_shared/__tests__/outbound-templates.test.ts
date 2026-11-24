import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  LEAD_FOLLOWUPS,
  OUTREACH_STAGE_OFFSETS_DAYS,
  OUTREACH_STAGES,
  outreachCampaign,
  outreachSequenceKey,
  renderOutreach,
  renderTemplate,
  REPLY_TO_DEFAULT,
  REPLY_TO_UNIVERSITY,
} from '../outbound-templates.mjs'
import { draftProblems } from '../reply-assist.ts'

const SENDER = 'Sam at Job-Hopper'
const LEADS = {
  university: { category: 'university', organization_name: 'State University', decision_maker_name: 'Pat Lee', student_size: 31250, recommended_package: '500+ seat custom cohort' },
  employer: { category: 'employer', organization_name: 'Acme Corp', decision_maker_name: 'Jo Kim', signals: { workers_affected: 240 }, city: 'Austin', state: 'TX', recommended_package: '100-499 seats' },
  career_partner: { category: 'career_partner', organization_name: 'Bright Careers', decision_maker_name: 'Ana Ruiz' },
}
const PROSPECT = { first_name: 'Maria Lopez', target_job_title: 'UX Designer' }
const TOKEN = 'a'.repeat(43)
const job = (i: number) => ({ title: `Product Designer ${i}`, company: `Studio ${i}`, location: 'Remote' })
const SHORTLIST = { token: TOKEN, jobs: [job(1), job(2), job(3), job(4)] }
const prospectSubject = (prospect = PROSPECT, shortlist: unknown = SHORTLIST) => ({ kind: 'prospect' as const, prospect, shortlist })

const allEmails = () => [
  ...Object.values(LEADS).flatMap((lead) =>
    [1, 2, 3, 4].map((stage) => ({ who: lead.category, stage, r: renderOutreach({ subject: { kind: 'lead', lead }, stage, campaign: 'nov', senderName: SENDER }) }))
  ),
  ...[1, 2, 3, 4].map((stage) => ({ who: 'prospect', stage, r: renderOutreach({ subject: prospectSubject(), stage, campaign: 'nov', senderName: SENDER }) })),
]

Deno.test('4 stages at day 0, 2, 4, 6; keys and campaigns', () => {
  assertEquals(OUTREACH_STAGE_OFFSETS_DAYS, [0, 2, 4, 6])
  assertEquals(OUTREACH_STAGES, 4)
  assertEquals(outreachSequenceKey('nov'), 'outreach_nov')
  assertEquals(outreachCampaign('nov', 3), 'outreach_nov_s3')
})

Deno.test('stage 1 for an institutional lead is the existing outbound template', () => {
  for (const lead of Object.values(LEADS)) {
    const original = renderTemplate(lead.category, lead, 'outreach_nov_s1', SENDER)
    const r = renderOutreach({ subject: { kind: 'lead', lead }, stage: 1, campaign: 'nov', senderName: SENDER })
    assertEquals([r.subject, r.body], [original.subject, original.body], lead.category)
    assertEquals(r.draft, false)
  }
})

Deno.test('stages 2-4 exist per category and are marked as drafts', () => {
  for (const category of ['university', 'employer', 'career_partner'] as const) {
    for (const stage of [2, 3, 4] as const) assert(LEAD_FOLLOWUPS[category][stage], `${category} s${stage}`)
  }
  for (const { who, stage, r } of allEmails()) assertEquals(r.draft, who === 'prospect' || stage > 1, `${who} s${stage}`)
})

Deno.test('every email is fully filled; drafts have no prices, invented jobs or sponsorship claims', () => {
  for (const { who, stage, r } of allEmails()) {
    assertEquals(r.unfilled, [], `${who} s${stage}`)
    // Stage-1 lead copy is the existing reviewed template (its 'not a guessed "sponsors
    // visas" tag' trips the sponsorship pattern by wording, not by claim); the rule is
    // about new draft copy.
    if (r.draft) assertEquals(draftProblems(`${r.subject}\n${r.body}`), [], `${who} s${stage}`)
    assertEquals(/\$\s?\d|\bfree\b|% off|discount/i.test(r.body), false, `${who} s${stage}`)
    assert(r.body.includes(SENDER), `${who} s${stage} signed`)
  }
})

Deno.test('every link carries the outreach UTMs for its stage', () => {
  for (const { who, stage, r } of allEmails()) {
    for (const link of r.body.match(/https:\/\/\S+/g) ?? []) {
      const p = new URL(link).searchParams
      assertEquals([p.get('utm_source'), p.get('utm_medium'), p.get('utm_campaign')], ['email_outbound', 'email', `outreach_nov_s${stage}`], `${who} s${stage}`)
    }
  }
  // stages that link at all: every prospect stage but the personal-help one
  const prospectLinks = allEmails().filter((e) => e.who === 'prospect').map((e) => (e.r.body.match(/https:\/\/\S+/g) ?? []).length)
  assertEquals(prospectLinks, [1, 1, 0, 1])
})

Deno.test('routing: Reply-To is a monitored job-hopper.co inbox; template keys per stage', () => {
  const uni = renderOutreach({ subject: { kind: 'lead', lead: LEADS.university }, stage: 2, campaign: 'nov', senderName: SENDER })
  assertEquals([uni.replyTo, uni.templateKey], [REPLY_TO_UNIVERSITY, 'outreach_university_s2'])
  const p = renderOutreach({ subject: prospectSubject(), stage: 1, campaign: 'nov', senderName: SENDER })
  assertEquals([p.replyTo, p.templateKey, p.fromName], [REPLY_TO_DEFAULT, 'outreach_prospect_s1', 'Job-Hopper'])
})

Deno.test('prospect personalization: first name and target role, with safe fallbacks', () => {
  const r = renderOutreach({ subject: prospectSubject(), stage: 1, campaign: 'nov', senderName: SENDER })
  assert(r.body.startsWith('Hi Maria,'))
  assert(r.subject === 'A shortlist of UX Designer jobs for you' && r.body.includes('a short list of UX Designer jobs'))
  const bare = renderOutreach({ subject: prospectSubject({ first_name: null, target_job_title: '  ' } as never), stage: 1, campaign: 'nov', senderName: SENDER })
  assert(bare.body.startsWith('Hi there,'))
  assertEquals(bare.subject, 'A shortlist of jobs for you')
  assert(bare.body.includes('a short list of jobs that match'))
  assertEquals(bare.unfilled, [])
  const s2 = renderOutreach({ subject: prospectSubject({ first_name: null, target_job_title: null } as never), stage: 2, campaign: 'nov', senderName: SENDER })
  assertEquals(s2.unfilled, [])
})

// ---- Stage 1 = the shortlist email -------------------------------------------------

const stage1 = (jobs: unknown[]) =>
  renderOutreach({ subject: prospectSubject(PROSPECT, { token: TOKEN, jobs }), stage: 1, campaign: 'nov', senderName: SENDER })

Deno.test('shortlist email: lists every job (3-5) inline and links the page', () => {
  for (const n of [3, 4, 5]) {
    const jobs = Array.from({ length: n }, (_, i) => job(i + 1))
    const r = stage1(jobs)
    const lines = r.body.split('\n').filter((l: string) => l.startsWith('- '))
    assertEquals(lines, jobs.map((j) => `- ${j.title}, ${j.company} (${j.location})`))
    assert(r.body.includes(`https://job-hopper.io/s/${TOKEN}?`))
    assert(r.html.includes(`>See your shortlist</a>`))
    assertEquals(r.html.match(/Product Designer \d/g)?.length, n)
    assertEquals(r.draft, true)
  }
})

Deno.test('shortlist email: never more than 5 jobs', () => {
  const r = stage1(Array.from({ length: 7 }, (_, i) => job(i + 1)))
  assertEquals(r.body.split('\n').filter((l: string) => l.startsWith('- ')).length, 5)
  assert(!r.body.includes('Product Designer 6'))
})

Deno.test('shortlist email: refuses fewer than 3 jobs or no shortlist', () => {
  assertThrows(() => stage1([job(1), job(2)]))
  assertThrows(() => stage1([]))
  assertThrows(() => renderOutreach({ subject: { kind: 'prospect', prospect: PROSPECT }, stage: 1, campaign: 'nov', senderName: SENDER }))
  assertThrows(() => renderOutreach({ subject: prospectSubject(PROSPECT, null), stage: 1, campaign: 'nov', senderName: SENDER }))
})

Deno.test('shortlist email: job text is escaped in HTML and brackets never look like placeholders', () => {
  const r = stage1([{ title: 'Engineer [Hybrid] <b>', company: 'A & B', location: null }, job(2), job(3)])
  assertEquals(r.unfilled, [])
  assert(r.body.includes('- Engineer (Hybrid) <b>, A & B'))
  assert(r.html.includes('Engineer (Hybrid) &lt;b&gt;, A &amp; B'))
  assert(!r.html.includes('<b>'))
})

Deno.test('shortlist email: no sponsorship, price or "free" wording', () => {
  const r = stage1([job(1), job(2), job(3)])
  assertEquals(draftProblems(`${r.subject}\n${r.body}`), [])
  assertEquals(/sponsor|visa|\$\s?\d|\bfree\b/i.test(r.body), false)
})

Deno.test('unknown stage or category throws instead of sending something wrong', () => {
  assertThrows(() => renderOutreach({ subject: { kind: 'lead', lead: LEADS.university }, stage: 5, campaign: 'nov', senderName: SENDER }))
  assertThrows(() => renderOutreach({ subject: { kind: 'lead', lead: { ...LEADS.university, category: 'workforce_org' } }, stage: 2, campaign: 'nov', senderName: SENDER }))
})
