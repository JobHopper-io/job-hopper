import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { profileAPI } from '@/lib/profile'
import { subscriptionAPI } from '@/lib/subscription'
import { getStatusLabel } from '@/lib/subscription'
import type { Profile, Subscription, Product, SubscriptionProduct, SubscriptionStatus } from '@/types/database'

export const useUserStore = defineStore('user', () => {

  // Raw DB Data
  const profile = ref<Profile | null>(null)
  const subscriptions = ref<Subscription[]>([])
  const products = ref<Product[]>([])
  const subscriptionProducts = ref<SubscriptionProduct[]>([])

  // Helper Data
  const isLoading = ref(false)

  // Computed Data
  const basePlan = computed<Product | null>(() => {
    const base = products.value.find(
      (p) => !p.is_addon && p.type === 'subscription',
    )
    return base ?? null
  })

  const addonProducts = computed<Product[]>(() =>
    products.value.filter((p) => p.is_addon),
  )

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
  async function refreshUserData() {
    isLoading.value = true
    try {
        const [profileResult, subscriptionResult] = await Promise.all([
            profileAPI.getCurrentUserProfile(),
            subscriptionAPI.getProfileSubscriptionData(),
        ])
        if (!profileResult.error) profile.value = profileResult.data
        if (!subscriptionResult.error && subscriptionResult.data) {
            subscriptions.value = subscriptionResult.data.subscriptions
            products.value = subscriptionResult.data.products
            subscriptionProducts.value = subscriptionResult.data.subscriptionProducts
        }
    } catch (error) {
        console.error('Error loading user data:', error)
    } finally {
        isLoading.value = false
    }
  }
  async function refreshProfile() {
    const { data, error } = await profileAPI.getCurrentUserProfile()
    if (!error) profile.value = data
  }

  function clear() {
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
    refreshUserData,
    refreshProfile,
    clear,
    basePlan,
    addonProducts,
    trialProducts,
    nextBillingAt,
    trialEndsAt,
    hasAddon,
    subscriptionStatusLabel
  }
})


