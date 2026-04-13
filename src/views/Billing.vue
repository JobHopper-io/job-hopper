<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import type { Product } from '@/types/database'
import { subscriptionAPI, formatProductLineLabel, getProductPrice } from '@/lib/subscription'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const {
  basePlan,
  subscriptionAddonProducts,
  oneTimeAddonProducts,
  nextBillingAt,
  trialEndsAt,
  isLoading,
} = storeToRefs(userStore)

const billingPortalLoading = ref(false)
const billingPortalError = ref<string | null>(null)
const tailoringPurchaseCount = ref<number | null>(null)

function formatOneTimeLine(product: Product, tailoringCount: number | null): string {
  const price = getProductPrice(product)
  const suffix = `($${price.toFixed(2)} one-time)`
  if (
    product.key === 'per_job_resume_advice' &&
    tailoringCount !== null
  ) {
    return `${product.display_name} ${suffix} ✖ ${tailoringCount}`
  }
  return `${product.display_name} ${suffix}`
}

onMounted(async () => {
  const { data, error } = await resumeProductsAPI.getTailoringPurchasesByMatchId()
  if (!error && data) {
    const nonCancelled = Object.values(data).filter((p) => p.status !== 'cancelled')
    tailoringPurchaseCount.value = nonCancelled.length
  } else {
    tailoringPurchaseCount.value = 0
  }
})

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
        <font-awesome-icon
          :icon="['fas', 'spinner']"
          spin
          class="h-8 w-8 text-brand-primary mx-auto mb-4"
          aria-hidden="true"
        />
        <p class="text-neutral-body">Loading...</p>
      </div>

      <div v-else-if="basePlan" class="space-y-6">
        <!-- Current Plan -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Current Plan</h2>
          <div class="space-y-2">
            <p class="text-neutral-body">
              <span class="font-semibold">Base plan:</span> {{ basePlan?.display_name }}
            </p>
            <p class="text-neutral-body">
              <span class="font-semibold">Monthly price:</span>
              <span v-if="basePlan"> ${{ getProductPrice(basePlan) }}/month</span>
              <span v-else>—</span>
            </p>
            <p v-if="nextBillingAt" class="text-neutral-body">
              <span class="font-semibold">Next billing date:</span> {{ new Date(nextBillingAt).toLocaleDateString() }}
            </p>
            <p v-if="trialEndsAt" class="text-sm text-red-600 font-medium">
              You're on a free trial.
            </p>
          </div>
        </div>

        <!-- Active Add-ons -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">
            Active Add-ons
          </h2>
          <div class="space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-brand-charcoal mb-2">
                Subscription add-ons
              </h3>
              <div v-if="subscriptionAddonProducts.length" class="space-y-2">
                <p
                  v-for="product in subscriptionAddonProducts"
                  :key="product.id"
                  class="text-neutral-body"
                >
                  ✓ {{ formatProductLineLabel(product) }}
                </p>
              </div>
              <p v-else class="text-neutral-body">No active subscription add-ons</p>
            </div>

            <div>
              <h3 class="text-sm font-semibold text-brand-charcoal mb-2">
                One-time purchases
              </h3>
              <div v-if="oneTimeAddonProducts.length" class="space-y-2">
                <p
                  v-for="product in oneTimeAddonProducts"
                  :key="product.id"
                  class="text-neutral-body"
                >
                  ✓ {{ formatOneTimeLine(product, tailoringPurchaseCount) }}
                </p>
              </div>
              <p v-else class="text-neutral-body">No one-time purchases</p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Manage Subscription</h2>
          <p class="text-sm text-neutral-body mb-4">
            Use the billing portal to update your payment method, view invoices, or update your billing address. Use manage subscription page to change your plan and manage add-ons. Price changes and prorations will take effect on your next billing cycle.
          </p>
          <div class="flex flex-col gap-2">
            <div class="flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                :disabled="billingPortalLoading"
                @click="handleManageBilling"
                class="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <font-awesome-icon
                  v-if="billingPortalLoading"
                  :icon="['fas', 'spinner']"
                  spin
                  class="h-5 w-5"
                  aria-hidden="true"
                />
                {{ billingPortalLoading ? 'Opening...' : 'Open Billing Portal' }}
              </button>
              <router-link
                to="/billing/manage"
                class="btn-secondary inline-flex items-center justify-center"
              >
                Manage Subscription
              </router-link>
            </div>
            <p v-if="billingPortalError" class="text-sm text-red-600" role="alert">
              {{ billingPortalError }}
            </p>
          </div>
        </div>
      </div>
      <div v-else class="space-y-6">
        <p class="text-neutral-body">No active plan</p>
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Manage Subscription</h2>
          <p class="text-sm text-neutral-body mb-4">
            You don't have an active subscription yet.
          </p>
          <router-link
            to="/billing/manage"
            class="btn-secondary inline-flex items-center justify-center"
          >
            Browse Subscriptions
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>
