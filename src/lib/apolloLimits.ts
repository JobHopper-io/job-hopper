import { supabase } from '@/lib/supabase'
import type { ApolloLimitsRow } from '@/types/database'

export const apolloLimitsAPI = {
  async list(): Promise<{ data: ApolloLimitsRow[]; error: Error | null }> {
    const { data, error } = await supabase.from('apollo_limits').select('*').order('name')
    if (error) {
      return { data: [], error: new Error(error.message) }
    }
    return { data: (data ?? []) as ApolloLimitsRow[], error: null }
  },

  async updateCreditLimit(
    id: string,
    creditLimit: number,
  ): Promise<{ error: Error | null }> {
    const { error } = await supabase
      .from('apollo_limits')
      .update({ credit_limit: creditLimit })
      .eq('id', id)
    if (error) {
      return { error: new Error(error.message) }
    }
    return { error: null }
  },
}
