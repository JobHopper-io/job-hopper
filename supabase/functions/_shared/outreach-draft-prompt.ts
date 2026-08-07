/** LLM prompt + response parsing for the employer's first outreach message to a candidate
 * whose reveal request was approved. Called directly from generate-outreach-draft via an
 * OpenAI-compatible chat completions endpoint - no separate service, no n8n. */

export const OUTREACH_DRAFT_SYSTEM = `You are an assistant that drafts a short, professional first-contact email from an employer to a job candidate who just approved sharing their contact info.

You are given the EMPLOYER, ROLE, and CANDIDATE fields below. Base the draft ONLY on these fields. Do NOT invent facts, skills, or experience not present in the input.

━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK
━━━━━━━━━━━━━━━━━━━━━━━

Write a warm, concise outreach email (under 150 words) from the employer introducing the role
and inviting the candidate to talk. Address the candidate by first name. Mention the role title
and pay range if given. Do not be pushy or use exclamation-heavy sales language.

━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━

{
  "type": "object",
  "properties": {
    "subject": { "type": "string" },
    "body": { "type": "string" }
  },
  "additionalProperties": false,
  "required": ["subject", "body"]
}

━━━━━━━━━━━━━━━━━━━━━━━
FINAL INSTRUCTIONS (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━

• Do NOT add additional explanations
• Do NOT add additional comments
• Output must be a valid JSON object with the specified structure, nothing more`

export interface OutreachDraftPromptInput {
  employerCompanyName: string
  roleTitle: string
  payMin: number | null
  payMax: number | null
  payType: string | null
  candidateFirstName: string
  candidateJobTitle: string | null
  candidateCareerLevel: string | null
  candidateYearsOfExperience: number | null
}

function formatPayRange(min: number | null, max: number | null, type: string | null): string {
  if (min == null && max == null) return ''
  const range = min != null && max != null ? `$${min.toLocaleString()} - $${max.toLocaleString()}` : `$${(min ?? max)!.toLocaleString()}+`
  return type ? `${range} / ${type}` : range
}

export function outreachDraftUserMessage(input: OutreachDraftPromptInput): string {
  return `━━━━━━━━━━━━━━━━━━━━━━━
EMPLOYER
━━━━━━━━━━━━━━━━━━━━━━━

Company name:
${input.employerCompanyName}

━━━━━━━━━━━━━━━━━━━━━━━
ROLE
━━━━━━━━━━━━━━━━━━━━━━━

Role title:
${input.roleTitle}

Pay range:
${formatPayRange(input.payMin, input.payMax, input.payType)}

━━━━━━━━━━━━━━━━━━━━━━━
CANDIDATE
━━━━━━━━━━━━━━━━━━━━━━━

First name:
${input.candidateFirstName}

Current job title:
${input.candidateJobTitle ?? ''}

Career level:
${input.candidateCareerLevel ?? ''}

Years of experience:
${input.candidateYearsOfExperience ?? ''}
`
}

/** Parses the LLM's `{"subject": ..., "body": ...}` response (optionally fenced in ```json).
 * Returns null on anything unusable - missing, malformed JSON, wrong shape, or empty strings. */
export function extractOutreachDraft(raw: string | null | undefined): { subject: string; body: string } | null {
  if (!raw) return null
  const fenced = raw.trim().match(/^`{2,3}(?:json)?\s*\n?([\s\S]*?)\n?`{2,3}\s*$/)
  const text = fenced ? fenced[1].trim() : raw.trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || !('subject' in parsed) || !('body' in parsed)) return null
  const { subject, body } = parsed as { subject: unknown; body: unknown }
  if (typeof subject !== 'string' || typeof body !== 'string') return null
  if (!subject.trim() || !body.trim()) return null
  return { subject: subject.trim(), body: body.trim() }
}
