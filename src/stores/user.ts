import { defineStore } from 'pinia'
import { ref } from 'vue'
import { userAPI, subscriptionAPI } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import type { Subscription } from '@/lib/subscription'

export const useUserStore = defineStore('user', () => {
  const profile = ref<Profile | null>(null)
  const subscription = ref<Subscription | null>(null)
  const isLoading = ref(false)

  async function loadUserData() {
    if (profile.value !== null) return
    isLoading.value = true
    try {
      const [profileResult, subscriptionResult] = await Promise.all([
        userAPI.getCurrentUserProfile(),
        subscriptionAPI.getCurrentSubscription()
      ])
      if (!profileResult.error) profile.value = profileResult.data
      if (!subscriptionResult.error) subscription.value = subscriptionResult.data
    } catch (error) {
      console.error('Error loading user data:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function refreshProfile() {
    const { data, error } = await userAPI.getCurrentUserProfile()
    if (!error) profile.value = data
  }

  async function refreshSubscription() {
    const { data, error } = await subscriptionAPI.getCurrentSubscription()
    if (!error) subscription.value = data
  }

  function clear() {
    profile.value = null
    subscription.value = null
  }

  return {
    profile,
    subscription,
    isLoading,
    loadUserData,
    refreshProfile,
    refreshSubscription,
    clear
  }
})
