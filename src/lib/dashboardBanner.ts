import { supabase } from '@/lib/supabase'
import type { DashboardBanner, DashboardBannerUpdate } from '@/types/database'

const SINGLETON_ID = 1

export function isDashboardBannerActive(banner: DashboardBanner | null): banner is DashboardBanner {
  if (!banner || !banner.message.trim()) return false
  const now = Date.now()
  if (banner.starts_at != null && banner.starts_at !== '') {
    if (Number.isNaN(new Date(banner.starts_at).getTime())) return false
    if (new Date(banner.starts_at).getTime() > now) return false
  }
  if (banner.ends_at != null && banner.ends_at !== '') {
    if (Number.isNaN(new Date(banner.ends_at).getTime())) return false
    if (new Date(banner.ends_at).getTime() <= now) return false
  }
  return true
}

export const dashboardBannerAPI = {
  async get(): Promise<{ data: DashboardBanner | null; error: string | null }> {
    const { data, error } = await supabase
      .from('dashboard_banner')
      .select('*')
      .eq('id', SINGLETON_ID)
      .maybeSingle()

    if (error) {
      return { data: null, error: error.message }
    }
    return { data, error: null }
  },

  async update(
    updates: Pick<DashboardBannerUpdate, 'message' | 'starts_at' | 'ends_at'>,
  ): Promise<{ data: DashboardBanner | null; error: string | null }> {
    const { data, error } = await supabase
      .from('dashboard_banner')
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
