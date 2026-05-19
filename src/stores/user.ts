import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { profileAPI } from '@/lib/profile'
import { subscriptionAPI } from '@/lib/subscription'
import { getStatusLabel } from '@/lib/subscription'
import { supabase } from '@/lib/supabase'
import type {
  Profile,
  Subscription,
  Product,
  SubscriptionProduct,
  SubscriptionStatus,
  FreemiumUsage,
  FreemiumSettings,
} from '@/types/database'

type ApolloPremiumInsightsLimitsRow = {
  name: string
  usage: number
  credit_limit: number
}

export const useUserStore = defineStore('user', () => {

  // Raw DB Data
  const profile = ref<Profile | null>(null)
  const subscriptions = ref<Subscription[]>([])
  const products = ref<Product[]>([])
  const subscriptionProducts = ref<SubscriptionProduct[]>([])
  const freemiumUsage = ref<FreemiumUsage | null>(null)
  const freemiumSettings = ref<FreemiumSettings | null>(null)
  const apolloPremiumInsightsLimits = ref<ApolloPremiumInsightsLimitsRow | null>(null)

  // Realtime subscription for subscription_product (user's subscriptions only)
  let subscriptionProductChannel: ReturnType<typeof supabase.channel> | null = null
  // Realtime subscription for the current user's profile
  let profileChannel: ReturnType<typeof supabase.channel> | null = null

  // Helper Data
  const isLoading = ref(false)

  // Computed Data
  const basePlan = computed<Product | null>(() => {
    const base = products.value.find(
      (p) => p.category === 'base_plan',
    )
    return base ?? null
  })

  const subscriptionAddonProducts = computed<Product[]>(() =>
    products.value.filter((p) => p.category === 'subscription_addon'),
  )

  const oneTimeAddonProducts = computed<Product[]>(() =>
    products.value.filter((p) => p.category === 'one_time_addon'),
  )

  const oneTimeItems = computed<Product[]>(() =>
    products.value.filter((p) => p.category === 'one_time_item'),
  )

  const addonProducts = computed<Product[]>(() => [
    ...subscriptionAddonProducts.value,
    ...oneTimeAddonProducts.value,
  ])

  const trialProducts = computed<Product[]>(() => {
    if (!subscriptions.value.length || !subscriptionProducts.value.length || !products.value.length) {
      return []
    }
    const trialSubIds = new Set(
      subscriptions.value
        .filter((s) => s.status === 'trial')
        .map((s) => s.id),
    )
    if (!trialSubIds.size) return []

    const trialProductIds = new Set(
      subscriptionProducts.value
        .filter((sp) => trialSubIds.has(sp.subscription_id))
        .map((sp) => sp.product_id),
    )

    if (!trialProductIds.size) return []

    return products.value.filter((p) => trialProductIds.has(p.id))
  })

  const nextBillingAt = computed<string | null>(() => {
    const dates = subscriptions.value
      .map((s) => s.current_period_ends_at)
      .filter((d): d is string => d != null)
    if (!dates.length) return null
    return dates.reduce((a, b) => (a < b ? a : b))
  })

  const trialEndsAt = computed<string | null>(() => {
    const trialSub = subscriptions.value.find((s) => s.status === 'trial')
    return trialSub?.current_period_ends_at ?? null
  })

  const subscriptionStatusLabel = computed<string>(() => {
    if (!subscriptions.value.length) return '—'
    const hasTrial = subscriptions.value.some((s) => s.status === 'trial')
    if (hasTrial) return getStatusLabel('trial' as SubscriptionStatus)
    const hasActive = subscriptions.value.some((s) => s.status === 'active')
    if (hasActive) return getStatusLabel('active' as SubscriptionStatus)
    return '—'
  })

  /** Trial/active subscription rows only (from subscriptionAPI). */
  const hasActiveSubscription = computed(() => subscriptions.value.length > 0)

  const freemiumMaxJobSearches = computed(
    () => freemiumSettings.value?.max_job_searches ?? 3,
  )
  const freemiumMaxResumeAdvice = computed(
    () => freemiumSettings.value?.max_resume_advice ?? 3,
  )

  const freemiumJobSearchesRemaining = computed(() => {
    const max = freemiumMaxJobSearches.value
    const used = freemiumUsage.value?.job_searches_used ?? 0
    return Math.max(0, max - used)
  })

  const freemiumResumeAdviceRemaining = computed(() => {
    const max = freemiumMaxResumeAdvice.value
    const used = freemiumUsage.value?.resume_advice_used ?? 0
    return Math.max(0, max - used)
  })

  const hasPremiumInsightsAddon = computed(() => {
    const activeSubIds = new Set(
      subscriptions.value
        .filter((s) => s.status === 'trial' || s.status === 'active')
        .map((s) => s.id),
    )
    const insightProduct = products.value.find((p) => p.key === 'premium_insights')
    if (!insightProduct) return false
    return subscriptionProducts.value.some(
      (sp) => activeSubIds.has(sp.subscription_id) && sp.product_id === insightProduct.id,
    )
  })

  const freemiumMaxPremiumInsights = computed(
    () => freemiumSettings.value?.max_premium_insights ?? 3,
  )

  const freemiumPremiumInsightsRemaining = computed(() => {
    const max = freemiumMaxPremiumInsights.value
    const used = freemiumUsage.value?.premium_insights_used ?? 0
    return Math.max(0, max - used)
  })

  /** Conservative gate: cold path needs 2 Apollo credits (org search + people match). */
  const apolloPremiumInsightsCanAffordColdPath = computed(() => {
    const row = apolloPremiumInsightsLimits.value
    if (!row) return false
    if (row.credit_limit <= 0) return false
    return row.usage + 2 <= row.credit_limit
  })

  const canRequestPremiumInsights = computed(() => {
    if (profile.value?.onboarding_completed !== true) return false
    if (!apolloPremiumInsightsCanAffordColdPath.value) return false
    if (hasPremiumInsightsAddon.value) return true
    if (freemiumMaxPremiumInsights.value <= 0) return false
    return freemiumPremiumInsightsRemaining.value > 0
  })

  /** Show manual job search panel (free users when the feature is enabled). Stays visible when credits are used up. */
  const showFreemiumJobSearchCta = computed(() => {
    if (!profile.value?.onboarding_completed) return false
    if (hasActiveSubscription.value) return false
    if (freemiumMaxJobSearches.value <= 0) return false
    return true
  })

  /** Whether the user can start another manual job search (credits remaining). */
  const freemiumCanRunManualJobSearch = computed(() => freemiumJobSearchesRemaining.value > 0)

  async function refreshFreemium() {
    const pid = profile.value?.id
    if (!pid) {
      freemiumUsage.value = null
      freemiumSettings.value = null
      apolloPremiumInsightsLimits.value = null
      return
    }
    const [usageResult, settingsResult, apolloInsightsResult] = await Promise.all([
      supabase.from('freemium_usage').select('*').eq('profile_id', pid).maybeSingle(),
      supabase.from('freemium_settings').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('apollo_limits')
        .select('name, usage, credit_limit')
        .eq('name', 'premium_insights')
        .maybeSingle(),
    ])
    if (usageResult.error) {
      console.error('Error loading freemium_usage:', usageResult.error)
      freemiumUsage.value = null
    } else {
      freemiumUsage.value = usageResult.data
    }
    if (settingsResult.error) {
      console.error('Error loading freemium_settings:', settingsResult.error)
      freemiumSettings.value = null
    } else {
      freemiumSettings.value = settingsResult.data
    }
    if (apolloInsightsResult.error) {
      console.error('Error loading apollo_limits (premium_insights):', apolloInsightsResult.error)
      apolloPremiumInsightsLimits.value = null
    } else {
      apolloPremiumInsightsLimits.value = apolloInsightsResult.data as ApolloPremiumInsightsLimitsRow | null
    }
  }

  async function refreshProfile() {
    const { data, error } = await profileAPI.getCurrentUserProfile()
    if (!error && data) {
      profile.value = data
      startProfileRealtime(data.id)
      await refreshFreemium()
    } else if (error) {
      console.error('Error loading profile data:', error)
      stopProfileRealtime()
      freemiumUsage.value = null
      freemiumSettings.value = null
      apolloPremiumInsightsLimits.value = null
    }
  }

  async function refreshSubscription() {
    isLoading.value = true
    try {
      const subscriptionResult = await subscriptionAPI.getProfileSubscriptionData()
      if (!subscriptionResult.error && subscriptionResult.data) {
        subscriptions.value = subscriptionResult.data.subscriptions
        products.value = subscriptionResult.data.products
        subscriptionProducts.value = subscriptionResult.data.subscriptionProducts
        const subIds = subscriptionResult.data.subscriptions.map((s) => s.id)
        startSubscriptionProductRealtime(subIds)
      } else {
        stopSubscriptionProductRealtime()
      }
    } catch (error) {
      console.error('Error loading subscription data:', error)
    } finally {
      isLoading.value = false
      void refreshFreemium()
    }
  }

  function stopProfileRealtime() {
    if (profileChannel) {
      supabase.removeChannel(profileChannel)
      profileChannel = null
    }
  }

  function startProfileRealtime(profileId: string | null | undefined) {
    if (!profileId) return
    stopProfileRealtime()
    profileChannel = supabase
      .channel('user-profile-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profileId}`,
        },
        () => {
          void refreshProfile()
        },
      )
      .subscribe()
  }

  function stopSubscriptionProductRealtime() {
    if (subscriptionProductChannel) {
      supabase.removeChannel(subscriptionProductChannel)
      subscriptionProductChannel = null
    }
  }

  function startSubscriptionProductRealtime(subscriptionIds: string[]) {
    if (subscriptionIds.length === 0) return
    stopSubscriptionProductRealtime()
    const filter = `subscription_id=in.(${subscriptionIds.join(',')})`
    subscriptionProductChannel = supabase
      .channel('user-subscription-product-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscription_product',
          filter,
        },
        () => {
          void refreshSubscription()
        },
      )
      .subscribe()
  }

  function clear() {
    stopSubscriptionProductRealtime()
    stopProfileRealtime()
    profile.value = null
    subscriptions.value = []
    products.value = []
    subscriptionProducts.value = []
    freemiumUsage.value = null
    freemiumSettings.value = null
    apolloPremiumInsightsLimits.value = null
  }

  return {
    profile,
    subscriptions,
    products,
    subscriptionProducts,
    isLoading,
    refreshProfile,
    refreshSubscription,
    refreshFreemium,
    hasActiveSubscription,
    freemiumUsage,
    freemiumSettings,
    freemiumMaxJobSearches,
    freemiumMaxResumeAdvice,
    freemiumJobSearchesRemaining,
    freemiumCanRunManualJobSearch,
    freemiumResumeAdviceRemaining,
    showFreemiumJobSearchCta,
    hasPremiumInsightsAddon,
    freemiumMaxPremiumInsights,
    freemiumPremiumInsightsRemaining,
    apolloPremiumInsightsLimits,
    apolloPremiumInsightsCanAffordColdPath,
    canRequestPremiumInsights,
    clear,
    basePlan,
    addonProducts,
    subscriptionAddonProducts,
    oneTimeAddonProducts,
    oneTimeItems,
    trialProducts,
    nextBillingAt,
    trialEndsAt,
    subscriptionStatusLabel
  }
})


