/** Shared OpenAI-compatible chat-completion call. Reads LLM_API_KEY/LLM_BASE_URL secrets
 * common to every LLM-calling edge function; the model name and messages are per-caller. */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type ChatCompletionResult =
  | { ok: true; content: string }
  | { ok: false; error: string; status: number }

export async function callChatCompletion(
  messages: ChatMessage[],
  opts: { model: string; temperature?: number; timeoutMs?: number },
): Promise<ChatCompletionResult> {
  const llmApiKey = Deno.env.get('LLM_API_KEY') ?? ''
  if (!llmApiKey) {
    return {
      ok: false,
      error: 'LLM_API_KEY must be set as an Edge Function secret (Dashboard → Edge Functions → Secrets).',
      status: 500,
    }
  }
  const llmBaseUrl = (Deno.env.get('LLM_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '')

  let chatRes: Response
  try {
    chatRes = await fetch(`${llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmApiKey}` },
      body: JSON.stringify({
        model: opts.model,
        temperature: opts.temperature ?? 0.2,
        messages,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    })
  } catch (fetchErr) {
    console.error('callChatCompletion: LLM request failed', {
      message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
    })
    return { ok: false, error: 'LLM request failed', status: 502 }
  }

  if (!chatRes.ok) {
    const errText = await chatRes.text().catch(() => '')
    console.error('callChatCompletion: LLM returned an error', { status: chatRes.status, body: errText })
    return { ok: false, error: 'LLM returned an error', status: 502 }
  }

  const chatData = (await chatRes.json()) as { choices?: { message?: { content?: string } }[] }
  const content = chatData.choices?.[0]?.message?.content ?? null
  if (!content) {
    return { ok: false, error: 'LLM returned an empty response', status: 502 }
  }
  return { ok: true, content }
}
