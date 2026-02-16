<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { subscriptionAPI } from '@/lib/supabase'
import { type Subscription } from '@/composables/useSubscription'
import { getTierDisplayName, getTierPrice, getActiveAddons } from '@/composables/useSubscription'

const subscription = ref<Subscription | null>(null)
const isLoading = ref(true)
const showCancelConfirm = ref(false)

const activeAddonsWithLabels = computed(() => getActiveAddons(subscription.value, true))

onMounted(async () => {
  try {
    const { data, error } = await subscriptionAPI.getCurrentSubscription()
    if (!error) {
      subscription.value = data
    }
  } catch (error) {
    console.error('Error loading subscription:', error)
  } finally {
    isLoading.value = false
  }
})

const handleCancel = async () => {
  try {
    await subscriptionAPI.cancelSubscription()
    showCancelConfirm.value = false
    // Reload subscription data
    const { data } = await subscriptionAPI.getCurrentSubscription()
    subscription.value = data
  } catch (error) {
    console.error('Error cancelling subscription:', error)
  }
}

const handleManageBilling = async () => {
  try {
    const { data, error } = await subscriptionAPI.createBillingPortalSession()
    if (error) {
      console.error('Error creating billing portal session:', error)
      alert('Unable to open billing portal. Please try again.')
      return
    }
    if (data?.url) {
      window.location.href = data.url
    }
  } catch (error) {
    console.error('Error opening billing portal:', error)
    alert('Unable to open billing portal. Please try again.')
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-heading font-bold text-brand-charcoal mb-8">Your Subscription</h1>

      <div v-if="isLoading" class="text-center py-12">
        <svg class="animate-spin h-8 w-8 text-brand-primary mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-neutral-body">Loading...</p>
      </div>

      <div v-else class="space-y-6">
        <!-- Current Plan -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Current Plan</h2>
          <div class="space-y-2">
            <p class="text-neutral-body">
              <span class="font-semibold">Base plan:</span> {{ getTierDisplayName(subscription?.subscription_tier) }}
            </p>
            <p class="text-neutral-body">
              <span class="font-semibold">Monthly price:</span> ${{ getTierPrice(subscription?.subscription_tier) }}/month
            </p>
            <p v-if="subscription?.current_period_end" class="text-neutral-body">
              <span class="font-semibold">Next billing date:</span> {{ new Date(subscription.current_period_end).toLocaleDateString() }}
            </p>
            <p v-if="subscription?.subscription_status === 'trial'" class="text-sm text-red-600 font-medium">
              You're on a free trial. Your first charge will occur on {{ subscription?.trial_ends_at ? new Date(subscription.trial_ends_at).toLocaleDateString() : 'N/A' }} unless you cancel.
            </p>
          </div>
        </div>

        <!-- Active Add-ons -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Active Add-ons</h2>
          <div v-if="activeAddonsWithLabels.length" class="space-y-2">
            <p v-for="item in activeAddonsWithLabels" :key="item.key" class="text-neutral-body">
              ✓ {{ item.label }}
            </p>
          </div>
          <p v-else class="text-neutral-body">No active add-ons</p>
        </div>

        <!-- Actions -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Manage Subscription</h2>
          <p class="text-sm text-neutral-body mb-4">
            Use the billing portal to update your payment method, view invoices, change your plan, manage add-ons, or update your billing address.
          </p>
          <div class="flex flex-col sm:flex-row gap-4">
            <button
              @click="handleManageBilling"
              class="btn-primary"
            >
              Open Billing Portal
            </button>
          </div>
        </div>

        <!-- Cancel Subscription -->
        <div class="card p-6 border-red-200">
          <h2 class="text-xl font-heading font-semibold text-red-800 mb-4">Cancel Subscription</h2>
          <p class="text-neutral-body mb-4">
            We're sorry to see you go. You'll keep access to your job feed until the end of your current billing period. You can reactivate your account anytime if you decide to come back.
          </p>
          <div v-if="!showCancelConfirm">
            <button
              @click="showCancelConfirm = true"
              class="text-red-600 hover:text-red-800 font-medium"
            >
              Cancel subscription
            </button>
          </div>
          <div v-else class="space-y-4">
            <p class="text-neutral-body font-medium">Are you sure you want to cancel?</p>
            <div class="flex gap-3">
              <button
                @click="handleCancel"
                class="bg-red-600 text-white px-4 py-2 rounded-[12px] hover:bg-red-700"
              >
                Yes, cancel
              </button>
              <button
                @click="showCancelConfirm = false"
                class="btn-secondary"
              >
                Keep subscription
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

