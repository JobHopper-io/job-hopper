import { supabase } from '@/lib/supabase'
import type { FreemiumSettings, FreemiumSettingsUpdate } from '@/types/database'

const SINGLETON_ID = 1

export const freemiumSettingsAPI = {
  async get(): Promise<{ data: FreemiumSettings | null; error: string | null }> {
    const { data, error } = await supabase
      .from('freemium_settings')
      .select('*')
      .eq('id', SINGLETON_ID)
      .maybeSingle()

    if (error) {
      return { data: null, error: error.message }
    }
    return { data, error: null }
  },

  async update(
    updates: Pick<FreemiumSettingsUpdate, 'max_job_searches' | 'max_resume_advice'>,
  ): Promise<{ data: FreemiumSettings | null; error: string | null }> {
    const { data, error } = await supabase
      .from('freemium_settings')
      .update(updates)
      .eq('id', SINGLETON_ID)
      .select('*')
      .maybeSingle()

    if (error) {
      return { data: null, error: error.message }
    }
    return { data, error: null }
  },
}
