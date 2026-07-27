/** LLM prompt + response parsing for Skills Gap analysis (JobDetail): compares the
 * candidate's resume text against a specific job's spec to find matching skills, missing
 * skills, and generic topics to learn. Called directly from generate-skills-gap via an
 * OpenAI-compatible chat completions endpoint - no separate service, no n8n. Mirrors
 * why-fit-prompt.ts's structure (single-shot prompt/parse pair per edge function). */

export const SKILLS_GAP_SYSTEM = `You are a career-coaching assistant that compares a candidate's resume against a specific job posting to find skill gaps.

You are given the candidate's RESUME TEXT and the JOB fields below. Base your analysis ONLY on these fields - do not invent facts not present in the input.

━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK
━━━━━━━━━━━━━━━━━━━━━━━

1. matchingSkills: skills or qualifications the job wants that the resume already shows evidence of. Short phrases (e.g. "SQL", "Team leadership"), not sentences.
2. missingSkills: skills or qualifications the job wants that the resume shows no evidence of. Same short-phrase format.
3. learningTopics: for each entry in missingSkills, one specific, searchable topic or keyword the candidate could go learn to close that gap (e.g. "AWS Lambda fundamentals" for a missing "serverless" skill). Same length and order as missingSkills - one topic per missing skill. Do not name specific courses, platforms, or providers - just the topic to search for.

If the resume already covers everything the job asks for, missingSkills and learningTopics should both be empty arrays.

━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━

{
  "type": "object",
  "properties": {
    "matchingSkills": { "type": "array", "items": { "type": "string" } },
    "missingSkills": { "type": "array", "items": { "type": "string" } },
    "learningTopics": { "type": "array", "items": { "type": "string" } }
  },
  "additionalProperties": false,
  "required": ["matchingSkills", "missingSkills", "learningTopics"]
}

━━━━━━━━━━━━━━━━━━━━━━━
FINAL INSTRUCTIONS (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━

• Do NOT add additional explanations
• Do NOT add additional comments
• Output must be a valid JSON object with the specified structure, nothing more`

export interface SkillsGapPromptInput {
  jobTitle: string
  companyName: string | null
  jobDescription: string | null
  resumeText: string
}

export function skillsGapUserMessage(input: SkillsGapPromptInput): string {
  return `━━━━━━━━━━━━━━━━━━━━━━━
JOB
━━━━━━━━━━━━━━━━━━━━━━━

Job title:
${input.jobTitle}

Company name:
${input.companyName ?? ''}

Job description:
${input.jobDescription ?? ''}

━━━━━━━━━━━━━━━━━━━━━━━
CANDIDATE RESUME
━━━━━━━━━━━━━━━━━━━━━━━

${input.resumeText}
`
}

export interface SkillsGapResult {
  matchingSkills: string[]
  missingSkills: string[]
  learningTopics: string[]
}

/** Parses the LLM's `{"matchingSkills": [...], "missingSkills": [...], "learningTopics": [...]}`
 * response (optionally fenced in ```json). Returns null on anything unusable - missing,
 * malformed JSON, or wrong shape. */
export function extractSkillsGap(raw: string | null | undefined): SkillsGapResult | null {
  if (!raw) return null
  const fenced = raw.trim().match(/^`{2,3}(?:json)?\s*\n?([\s\S]*?)\n?`{2,3}\s*$/)
  const text = fenced ? fenced[1].trim() : raw.trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>

  const toStringArray = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null
    return v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
  }

  const matchingSkills = toStringArray(p.matchingSkills)
  const missingSkills = toStringArray(p.missingSkills)
  const learningTopics = toStringArray(p.learningTopics)
  if (matchingSkills === null || missingSkills === null || learningTopics === null) return null

  return { matchingSkills, missingSkills, learningTopics }
}
