import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { profileAPI } from '@/lib/profile'
import { subscriptionAPI } from '@/lib/subscription'
import { getStatusLabel } from '@/lib/subscription'
import { supabase } from '@/lib/supabase'
import type { Profile, Subscription, Product, SubscriptionProduct, SubscriptionStatus } from '@/types/database'

export const useUserStore = defineStore('user', () => {

  // Raw DB Data
  const profile = ref<Profile | null>(null)
  const subscriptions = ref<Subscription[]>([])
  const products = ref<Product[]>([])
  const subscriptionProducts = ref<SubscriptionProduct[]>([])

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

  // Data Management Functions
  async function refreshProfile() {
    const { data, error } = await profileAPI.getCurrentUserProfile()
    if (!error && data) {
      profile.value = data
      startProfileRealtime(data.id)
    } else if (error) {
      console.error('Error loading profile data:', error)
      stopProfileRealtime()
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
  }

  // Helper Functions
  function hasAddon(key: string): boolean {
    return addonProducts.value.some((p) => p.key === key)
  }

  return {
    profile,
    subscriptions,
    products,
    subscriptionProducts,
    isLoading,
    refreshProfile,
    refreshSubscription,
    clear,
    basePlan,
    addonProducts,
    subscriptionAddonProducts,
    oneTimeAddonProducts,
    oneTimeItems,
    trialProducts,
    nextBillingAt,
    trialEndsAt,
    hasAddon,
    subscriptionStatusLabel
  }
})


