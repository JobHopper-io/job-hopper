/** LLM prompt + response parsing for Mock Interview Practice (JobDetail): a turn-by-turn
 * mock interview for a specific job match. Called directly from interview-practice via an
 * OpenAI-compatible chat completions endpoint - no separate service, no n8n. Mirrors
 * why-fit-prompt.ts's structure (single-shot prompt/parse pair per edge function). */

export const INTERVIEW_SYSTEM = `You are an interviewer conducting a mock job interview to help a candidate practice for a specific role.

You are given the JOB the candidate is targeting and, if available, their RESUME. Ask one interview question at a time, grounded in the job's actual responsibilities and requirements - not generic questions that could apply to any role.

━━━━━━━━━━━━━━━━━━━━━━━
EVALUATING ANSWERS
━━━━━━━━━━━━━━━━━━━━━━━

When the candidate's most recent message is an answer to your previous question, evaluate it against:
- Specificity: concrete details and examples, not vague generalities.
- Ownership: "I did X", not "we did X" - what did THEY personally do.
- Structure: situation → action → outcome (or a clear equivalent), not a meandering answer.
- Relevance: does it actually address what the job needs, based on the job description below.

Give ONE short, direct sentence of feedback (max ~30 words) - specific praise or a specific gap,
never vague ("good answer"). If their resume is provided and something on it would have made a
stronger answer, say so directly (e.g. "you mentioned X on your resume - bring that up here").

If this is the very first question of the interview (no answer to evaluate yet), feedback must be null.

━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━

{
  "type": "object",
  "properties": {
    "feedback": { "type": ["string", "null"] },
    "question": { "type": "string" }
  },
  "additionalProperties": false,
  "required": ["feedback", "question"]
}

━━━━━━━━━━━━━━━━━━━━━━━
FINAL INSTRUCTIONS (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━

• Ask exactly ONE question per turn - never multiple questions at once.
• Do NOT add additional explanations or comments outside the schema.
• Output must be a valid JSON object with the specified structure, nothing more`

export interface InterviewOpeningInput {
  jobTitle: string
  companyName: string | null
  jobDescription: string | null
  resumeText: string | null
}

export function interviewOpeningMessage(input: InterviewOpeningInput): string {
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

${input.resumeText ?? '(no resume on file - ask questions based on the job alone)'}

Ask the first interview question now. There is no prior answer to evaluate, so feedback must be null.
`
}

export interface InterviewTurn {
  feedback: string | null
  question: string
}

/** Parses the LLM's `{"feedback": ..., "question": ...}` response (optionally fenced in
 * ```json). Returns null on anything unusable - missing, malformed JSON, or no usable question. */
export function extractInterviewTurn(raw: string | null | undefined): InterviewTurn | null {
  if (!raw) return null
  const fenced = raw.trim().match(/^`{2,3}(?:json)?\s*\n?([\s\S]*?)\n?`{2,3}\s*$/)
  const text = fenced ? fenced[1].trim() : raw.trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || !('question' in parsed)) return null
  const p = parsed as { question: unknown; feedback?: unknown }
  if (typeof p.question !== 'string' || !p.question.trim()) return null
  const feedback = typeof p.feedback === 'string' && p.feedback.trim() ? p.feedback.trim() : null
  return { feedback, question: p.question.trim() }
}
