/**
 * Resume products API: product lookups, resume_products lifecycle, and per-job resume advice checkout.
 */

import { supabase } from '@/lib/supabase'
import { profileAPI } from '@/lib/profile'
import { subscriptionAPI } from '@/lib/subscription'
import type { Product, ResumeProduct } from '@/types/database'

const productColumns =
  'id, key, display_name, description, category, price_cents, available_for_purchase, stripe_product_id'

async function getCurrentProfileId(): Promise<string> {
  const { data, error } = await profileAPI.getCurrentUserProfile()
  if (error || !data) throw new Error('Not authenticated')
  return data.id
}

async function getPerJobResumeAdviceProductId(): Promise<string | null> {
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('key', 'per_job_resume_advice')
    .maybeSingle()
  return data?.id ?? null
}

async function getResumeUpgradeProductId(): Promise<string | null> {
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('key', 'resume_upgrade')
    .maybeSingle()
  return data?.id ?? null
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
      .eq('available_for_purchase', true)
      .maybeSingle()
    if (error) return { data: null, error: new Error(error.message) }
    return { data, error: null }
  },

  async getResumeAdviceProduct(): Promise<{
    data: Product | null
    error: Error | null
  }> {
    const { data, error } = await supabase
      .from('products')
      .select(productColumns)
      .eq('key', 'per_job_resume_advice')
      .eq('available_for_purchase', true)
      .maybeSingle()
    if (error) return { data: null, error: new Error(error.message) }
    return { data, error: null }
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
    return { data: data ?? [], error: null }
  },

  /** Latest resume overhaul purchase for this profile (`job_match_id` null). */
  async getResumeUpgradePurchase(): Promise<{
    data: ResumeProduct | null
    error: Error | null
  }> {
    const profileId = await getCurrentProfileId()
    const productId = await getResumeUpgradeProductId()
    if (!productId) {
      return { data: null, error: null }
    }
    const { data, error } = await supabase
      .from('resume_products')
      .select('*')
      .eq('profile_id', profileId)
      .eq('product_id', productId)
      .is('job_match_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return { data: null, error: new Error(error.message) }
    return { data, error: null }
  },

  async getTailoringPurchaseForMatch(matchId: string): Promise<{
    data: ResumeProduct | null
    error: Error | null
  }> {
    const profileId = await getCurrentProfileId()
    const productId = await getPerJobResumeAdviceProductId()
    if (!productId) {
      return { data: null, error: null }
    }
    const { data, error } = await supabase
      .from('resume_products')
      .select('*')
      .eq('profile_id', profileId)
      .eq('job_match_id', matchId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return { data: null, error: new Error(error.message) }
    return { data, error: null }
  },

  /** Returns a map of job_match_id → per-job resume advice purchase for all matches that have one (any status). */
  async getTailoringPurchasesByMatchId(): Promise<{
    data: Record<string, ResumeProduct>
    error: Error | null
  }> {
    const productId = await getPerJobResumeAdviceProductId()
    const { data: allResumeProducts, error } =
      await resumeProductsAPI.getResumeProductsForProfile()
    if (error) return { data: {}, error }
    if (!productId) return { data: {}, error: null }
    const byMatchId: Record<string, ResumeProduct> = {}
    for (const row of allResumeProducts ?? []) {
      if (row.job_match_id && row.product_id === productId) {
        byMatchId[row.job_match_id] = row
      }
    }
    return { data: byMatchId, error: null }
  },

  async startAdviceCheckout(
    matchId: string,
    returnPath?: string,
  ): Promise<{
    data: { url: string } | { freemium: true } | null
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
        error: new Error('You have already purchased resume advice for this job.'),
      }
    }

    const { data: product, error: productError } =
      await resumeProductsAPI.getResumeAdviceProduct()
    if (productError || !product) {
      return {
        data: null,
        error: productError ?? new Error('Resume advice product not found'),
      }
    }

    const profileId = await getCurrentProfileId()

    const [{ data: limitsRow }, { data: settingsRow }] = await Promise.all([
      supabase.from('freemium_usage').select('resume_advice_used').eq('profile_id', profileId).maybeSingle(),
      supabase.from('freemium_settings').select('max_resume_advice').eq('id', 1).maybeSingle(),
    ])

    const maxAdvice =
      typeof settingsRow?.max_resume_advice === 'number' ? settingsRow.max_resume_advice : 3
    const usedAdvice =
      typeof limitsRow?.resume_advice_used === 'number' ? limitsRow.resume_advice_used : 0
    const freeRemaining = maxAdvice > 0 ? Math.max(0, maxAdvice - usedAdvice) : 0

    if (freeRemaining > 0) {
      const { data: fnData, error: fnError } = await supabase.functions.invoke<{
        resumeProductId?: string
        error?: string
      }>('freemium-resume-advice', { body: { job_match_id: matchId } })

      if (fnError) {
        return { data: null, error: new Error(fnError.message) }
      }
      if (fnData && typeof fnData === 'object' && 'error' in fnData && fnData.error) {
        return { data: null, error: new Error(String(fnData.error)) }
      }
      return { data: { freemium: true }, error: null }
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
