import { supabase } from '@/lib/supabase'
import { parseFunctionsInvokeError, errorMessageFromInvokeData } from '@/lib/parse-functions-invoke-error'

/** Max characters per chat message; the support-chat edge function enforces the same cap. */
export const SUPPORT_CHAT_MAX_LENGTH = 1000

export const supportChatAPI = {
  /** Sends a question to the support assistant via the rate-limited support-chat proxy. */
  async ask(message: string): Promise<{ answer: string | null; error: Error | null }> {
    const { data, error } = await supabase.functions.invoke<{ answer?: string | null; error?: string }>(
      'support-chat',
      { body: { message } },
    )
    if (error) {
      // Only messages from the function itself (rate limit, length, outage) are written for
      // visitors; network-level failures return null so the widget shows its own fallback.
      const fromFunction = (error as { context?: unknown }).context instanceof Response
      return {
        answer: null,
        error: new Error(fromFunction ? await parseFunctionsInvokeError(error) : ''),
      }
    }
    const dataError = errorMessageFromInvokeData(data)
    if (dataError) {
      return { answer: null, error: new Error(dataError) }
    }
    return { answer: data?.answer ?? null, error: null }
  },
}
