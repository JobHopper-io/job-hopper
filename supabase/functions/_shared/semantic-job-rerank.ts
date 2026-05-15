import type { MatchConfig, RankedJob, SubscriberPreferences } from './job-matching-algorithm.ts'

function extractJsonArray(raw: string): unknown[] | null {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Re-score the top N ranked jobs using OpenAI relevance scores (0–10), added as relevance * semantic.weight.
 */
export async function applySemanticRerankIfEnabled(
  prefs: SubscriberPreferences,
  ranked: RankedJob[],
  cfg: MatchConfig,
): Promise<RankedJob[]> {
  const sem = cfg.semantic
  if (!sem?.rerankEnabled || ranked.length === 0) return ranked

  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (!apiKey) return ranked

  const n = Math.min(Math.max(1, Math.floor(sem.rerankCount)), ranked.length)
  const head = ranked.slice(0, n).map((r) => ({ ...r }))
  const tail = ranked.slice(n)

  const jobsPayload = head.map((r) => ({
    id: r.id,
    title: r.title,
    briefing: (r.aiBriefing ?? '').slice(0, 1600),
  }))

  const userPayload = {
    current_job_title: prefs.currentJobTitle,
    current_industry: prefs.currentIndustry,
    target_role_categories: prefs.roles,
  }

  const instructions =
    `Candidate preferences (JSON):\n${JSON.stringify(userPayload)}\n\n` +
    `Jobs (JSON):\n${JSON.stringify(jobsPayload)}\n\n` +
    `For each job id, output relevance 0–10 for how well the job fits this candidate (role focus, seniority, domain). ` +
    `Return ONLY a JSON array like [{"id":"<uuid>","relevance":8},...] with one entry per job id, no prose.`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You output only valid JSON arrays. No markdown fences.',
          },
          { role: 'user', content: instructions },
        ],
      }),
    })

    if (!res.ok) {
      console.warn('semantic rerank: OpenAI HTTP error', res.status)
      return ranked
    }

    const completion = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = completion.choices?.[0]?.message?.content ?? ''
    const arr = extractJsonArray(content)
    if (!arr) {
      console.warn('semantic rerank: failed to parse JSON from model')
      return ranked
    }

    const relById = new Map<string, number>()
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue
      const rec = item as { id?: unknown; relevance?: unknown }
      if (typeof rec.id !== 'string') continue
      const rel = typeof rec.relevance === 'number' ? rec.relevance : Number(rec.relevance)
      if (!Number.isFinite(rel)) continue
      relById.set(rec.id, Math.min(10, Math.max(0, rel)))
    }

    const w = sem.weight
    for (const job of head) {
      const base = job.score
      const rel = relById.get(job.id) ?? 5
      job.score = base + rel * w
    }

    head.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const aMs = Date.parse(a.postedDate ?? a.createdAt)
      const bMs = Date.parse(b.postedDate ?? b.createdAt)
      if (!Number.isNaN(aMs) && !Number.isNaN(bMs)) return bMs - aMs
      return 0
    })

    return [...head, ...tail]
  } catch (err) {
    console.warn('semantic rerank: error', err instanceof Error ? err.message : String(err))
    return ranked
  }
}
