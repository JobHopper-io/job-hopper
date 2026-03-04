/**
 * Resume products API: product lookups, resume_products lifecycle, and per-job tailoring checkout.
 */

import { supabase } from '@/lib/supabase'
import { profileAPI } from '@/lib/profile'
import { subscriptionAPI } from '@/lib/subscription'
import type { Product, ResumeProduct } from '@/types/database'

const productColumns = 'id, key, display_name, description, category, price_cents'

async function getCurrentProfileId(): Promise<string> {
  const { data, error } = await profileAPI.getCurrentUserProfile()
  if (error || !data) throw new Error('Not authenticated')
  return data.id
}

export const resumeProductsAPI = {
  async getResumeUpgradeProduct(): Promise<{
    data: Product | null
    error: Error | null
  }> {
    const { data, error } = await supabase
      .from('products')
      .select(productColumns)
      .eq('key', 'resume_upgrade')
      .maybeSingle()
    if (error) return { data: null, error: new Error(error.message) }
    return { data: data as Product | null, error: null }
  },

  async getResumeTailoringProduct(): Promise<{
    data: Product | null
    error: Error | null
  }> {
    const { data, error } = await supabase
      .from('products')
      .select(productColumns)
      .eq('key', 'resume_tailoring')
      .maybeSingle()
    if (error) return { data: null, error: new Error(error.message) }
    return { data: data as Product | null, error: null }
  },

  async getResumeProductsForProfile(): Promise<{
    data: ResumeProduct[] | null
    error: Error | null
  }> {
    const profileId = await getCurrentProfileId()
    const { data, error } = await supabase
      .from('resume_products')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
    if (error) return { data: null, error: new Error(error.message) }
    return { data: (data ?? []) as ResumeProduct[], error: null }
  },

  async getTailoringPurchaseForMatch(matchId: string): Promise<{
    data: ResumeProduct | null
    error: Error | null
  }> {
    const profileId = await getCurrentProfileId()
    const { data, error } = await supabase
      .from('resume_products')
      .select('*')
      .eq('profile_id', profileId)
      .eq('job_match_id', matchId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return { data: null, error: new Error(error.message) }
    return { data: data as ResumeProduct | null, error: null }
  },

  /** Returns a map of job_match_id → tailoring purchase for all matches that have one (any status). Uses the full list of resume products for the profile and filters to per-job tailoring (job_match_id not null). */
  async getTailoringPurchasesByMatchId(): Promise<{
    data: Record<string, ResumeProduct>
    error: Error | null
  }> {
    const { data: allResumeProducts, error } =
      await resumeProductsAPI.getResumeProductsForProfile()
    if (error) return { data: {}, error }
    const byMatchId: Record<string, ResumeProduct> = {}
    for (const row of allResumeProducts ?? []) {
      if (row.job_match_id) byMatchId[row.job_match_id] = row
    }
    return { data: byMatchId, error: null }
  },

  async startTailoringCheckout(
    matchId: string,
    returnPath?: string,
  ): Promise<{
    data: { url: string } | null
    error: Error | null
  }> {
    const { data: existing, error: existingError } =
      await resumeProductsAPI.getTailoringPurchaseForMatch(matchId)
    if (existingError) {
      return { data: null, error: existingError }
    }
    if (existing && existing.status !== 'cancelled') {
      return {
        data: null,
        error: new Error('You have already purchased resume tailoring for this job.'),
      }
    }

    const { data: product, error: productError } =
      await resumeProductsAPI.getResumeTailoringProduct()
    if (productError || !product) {
      return {
        data: null,
        error: productError ?? new Error('Resume tailoring product not found'),
      }
    }
    const base = window.location.origin
    const path = returnPath ?? '/dashboard'
    const successUrl = `${base}${path}${path.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${base}${path}`
    const { data, error } = await subscriptionAPI.createCheckoutSession(
      [product.id],
      successUrl,
      cancelUrl,
      { jobMatchId: matchId },
    )
    if (error) return { data: null, error }
    if (!data?.url) return { data: null, error: new Error('No checkout URL returned') }
    return { data: { url: data.url }, error: null }
  },
}
