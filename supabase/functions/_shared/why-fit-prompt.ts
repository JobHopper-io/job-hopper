/** LLM prompt + response parsing for "why this is a fit" (JobDetail): compares the
 * candidate's profile fields directly against a single job's spec. Called directly from
 * generate-why-fit via an OpenAI-compatible chat completions endpoint - no separate
 * service, no n8n. */

export const WHY_FIT_SYSTEM = `You are a job-matching assistant that explains WHY a specific candidate profile is a good fit for a specific job.

You are given the CANDIDATE PROFILE and the JOB fields below. Base your reasoning ONLY on these fields.
Do NOT invent facts not present in the input.

━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK
━━━━━━━━━━━━━━━━━━━━━━━

Write 3 to 4 short bullet points explaining why this job is a good match for this candidate,
comparing the candidate's background, target role, industry, location preferences, and salary
expectations directly against the job's title, description, location, and pay.

Each bullet must be a single specific sentence (max ~25 words) grounded in the actual input
fields — not generic filler like "this role aligns with your goals". If the match is weak on a
dimension (e.g. salary or location), omit that dimension rather than force a bullet for it.

━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━

{
  "type": "object",
  "properties": {
    "bullets": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 4
    }
  },
  "additionalProperties": false,
  "required": ["bullets"]
}

━━━━━━━━━━━━━━━━━━━━━━━
FINAL INSTRUCTIONS (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━

• Do NOT add additional explanations
• Do NOT add additional comments
• Output must be a valid JSON object with the specified structure, nothing more`

export interface WhyFitPromptInput {
  currentJobTitle: string | null
  targetJobTitle: string | null
  yearsOfExperience: number | null
  currentIndustry: string | null
  targetRoleCategories: string[]
  desiredSalaryMin: number | null
  desiredSalaryMax: number | null
  preferredLocations: string[]
  openToRelocation: boolean | null
  openToRemote: boolean | null
  jobTitle: string
  companyName: string | null
  jobDescription: string | null
  jobLocation: string | null
  jobIsRemote: boolean | null
  jobPayMin: number | null
  jobPayMax: number | null
  jobRoleCategory: string | null
  matchScore: number | null
}

export function formatSalaryRange(min: number | null, max: number | null): string {
  if (min && max) return `$${min.toLocaleString()} - $${max.toLocaleString()}`
  if (min) return `$${min.toLocaleString()}+`
  if (max) return `Up to $${max.toLocaleString()}`
  return ''
}

export function whyFitUserMessage(input: WhyFitPromptInput): string {
  return `━━━━━━━━━━━━━━━━━━━━━━━
CANDIDATE PROFILE
━━━━━━━━━━━━━━━━━━━━━━━

Current job title:
${input.currentJobTitle ?? ''}

Target job title:
${input.targetJobTitle ?? ''}

Years of experience:
${input.yearsOfExperience ?? ''}

Current industry:
${input.currentIndustry ?? ''}

Target role categories:
${input.targetRoleCategories.join(', ')}

Desired salary range:
${formatSalaryRange(input.desiredSalaryMin, input.desiredSalaryMax)}

Preferred locations:
${input.preferredLocations.join(', ')}

Open to relocation:
${input.openToRelocation ? 'yes' : 'no'}

Open to remote:
${input.openToRemote ? 'yes' : 'no'}

━━━━━━━━━━━━━━━━━━━━━━━
JOB
━━━━━━━━━━━━━━━━━━━━━━━

Job title:
${input.jobTitle}

Company name:
${input.companyName ?? ''}

Job description:
${input.jobDescription ?? ''}

Location:
${input.jobLocation ?? ''}

Is remote:
${input.jobIsRemote ? 'yes' : 'no'}

Pay range:
${formatSalaryRange(input.jobPayMin, input.jobPayMax)}

Role category:
${input.jobRoleCategory ?? ''}

Match score (0-100, algorithmic):
${input.matchScore ?? ''}
`
}

/** Parses the LLM's `{"bullets": [...]}` response (optionally fenced in ```json). Returns
 * [] on anything unusable - missing, malformed JSON, wrong shape, or no non-empty strings. */
export function extractWhyFitBullets(raw: string | null | undefined, maxBullets = 4): string[] {
  if (!raw) return []
  const fenced = raw.trim().match(/^`{2,3}(?:json)?\s*\n?([\s\S]*?)\n?`{2,3}\s*$/)
  const text = fenced ? fenced[1].trim() : raw.trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object' || !('bullets' in parsed)) return []
  const bullets = (parsed as { bullets: unknown }).bullets
  if (!Array.isArray(bullets)) return []
  return bullets
    .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
    .map((b) => b.trim())
    .slice(0, maxBullets)
}
