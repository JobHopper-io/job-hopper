import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

export type TryConsumeResult = {
  ok: boolean
  usageAfter: number
  creditLimit: number
}

function rowFromRpc(data: unknown): TryConsumeResult | null {
  if (data == null) return null
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  return {
    ok: r.ok === true,
    usageAfter: typeof r.usage_after === 'number' ? r.usage_after : 0,
    creditLimit: typeof r.credit_limit === 'number' ? r.credit_limit : 0,
  }
}

export async function tryConsumeApolloCredits(
  client: SupabaseClient,
  name: string,
  amount: number,
): Promise<TryConsumeResult> {
  const { data, error } = await client.rpc('try_consume_apollo_credits', {
    p_name: name,
    p_amount: amount,
  })
  if (error) {
    console.error('try_consume_apollo_credits', name, amount, error.message)
    return { ok: false, usageAfter: 0, creditLimit: 0 }
  }
  return rowFromRpc(data) ?? { ok: false, usageAfter: 0, creditLimit: 0 }
}

export async function refundApolloCredits(
  client: SupabaseClient,
  name: string,
  amount: number,
): Promise<void> {
  const { error } = await client.rpc('refund_apollo_credits', {
    p_name: name,
    p_amount: amount,
  })
  if (error) {
    console.error('refund_apollo_credits', name, amount, error.message)
  }
}

export async function resetApolloLimitsUsage(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('reset_apollo_limits_usage')
  if (error) {
    throw new Error(error.message)
  }
}
