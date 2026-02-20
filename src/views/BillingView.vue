<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { subscriptionAPI } from '@/lib/subscription'
import { getTierDisplayName, getTierPrice, getActiveAddons } from '@/lib/subscription'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const { subscription, isLoading } = storeToRefs(userStore)

const billingPortalLoading = ref(false)
const billingPortalError = ref<string | null>(null)

const activeAddonsWithLabels = computed(() => getActiveAddons(subscription.value, true))

const BILLING_PORTAL_ERROR_MSG = 'Unable to open billing portal. Please try again later.'

const handleManageBilling = async () => {
  billingPortalError.value = null
  billingPortalLoading.value = true
  try {
    const { data, error } = await subscriptionAPI.createBillingPortalSession()
    if (error) {
      console.error('Error creating billing portal session:', error)
      billingPortalError.value = BILLING_PORTAL_ERROR_MSG
      return
    }
    if (data?.url) {
      window.location.href = data.url
    }
  } catch (error) {
    console.error('Error opening billing portal:', error)
    billingPortalError.value = BILLING_PORTAL_ERROR_MSG
  } finally {
    billingPortalLoading.value = false
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
              <span class="font-semibold">Base plan:</span> {{ getTierDisplayName(subscription?.tier) }}
            </p>
            <p class="text-neutral-body">
              <span class="font-semibold">Monthly price:</span> ${{ getTierPrice(subscription?.tier) }}/month
            </p>
            <p v-if="subscription?.subscription?.current_period_ends_at" class="text-neutral-body">
              <span class="font-semibold">Next billing date:</span> {{ new Date(subscription.subscription.current_period_ends_at).toLocaleDateString() }}
            </p>
            <p v-if="subscription?.subscription?.subscription_status === 'trial'" class="text-sm text-red-600 font-medium">
              You're on a free trial. Your first charge will occur on {{ subscription?.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString() : 'N/A' }} unless you cancel.
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
          <div class="flex flex-col gap-2">
            <div class="flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                :disabled="billingPortalLoading"
                @click="handleManageBilling"
                class="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <svg
                  v-if="billingPortalLoading"
                  class="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {{ billingPortalLoading ? 'Opening...' : 'Open Billing Portal' }}
              </button>
            </div>
            <p v-if="billingPortalError" class="text-sm text-red-600" role="alert">
              {{ billingPortalError }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

