<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
  oneTimeItems,
  nextBillingAt,
  trialEndsAt,
  subscriptionStatusLabel,
  isLoading,
} = storeToRefs(userStore)

/** One-time add-ons plus one-time items (e.g. per-job resume advice) from profile entitlements. */
const oneTimePurchaseProducts = computed(() => [
  ...oneTimeAddonProducts.value,
  ...oneTimeItems.value,
])

const billingPortalLoading = ref(false)
const billingPortalError = ref<string | null>(null)
const purchaseCount = ref<number | null>(null)

function formatOneTimeLine(product: Product, tailoringCount: number | null): string {
  const price = getProductPrice(product)
  const suffix = `($${price.toFixed(2)} one-time)`
  if (
    product.key === 'per_job_resume_advice' &&
    tailoringCount !== null
  ) {
    return `${product.display_name} ${suffix} × ${tailoringCount}`
  }
  return `${product.display_name} ${suffix}`
}

onMounted(async () => {
  const { data, error } = await resumeProductsAPI.getTailoringPurchasesByMatchId()
  if (!error && data) {
    const nonCancelled = Object.values(data).filter((p) => p.status !== 'cancelled')
    purchaseCount.value = nonCancelled.length
  } else {
    purchaseCount.value = 0
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
          <h2 class="flex items-center gap-2 text-xl font-heading font-semibold text-brand-charcoal mb-4">
            <font-awesome-icon :icon="['fas', 'crown']" class="h-4 w-4 text-brand-primary" aria-hidden="true" />
            Current Plan
          </h2>
          <div class="flex items-center gap-3 mb-3">
            <span class="text-lg font-semibold text-brand-charcoal">{{ basePlan.display_name }}</span>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-semibold">
              {{ subscriptionStatusLabel }}
            </span>
          </div>
          <div class="space-y-1.5 text-neutral-body">
            <p><span class="font-semibold">Monthly price:</span> ${{ getProductPrice(basePlan) }}/month</p>
            <p v-if="nextBillingAt">
              <span class="font-semibold">Next billing date:</span> {{ new Date(nextBillingAt).toLocaleDateString() }}
            </p>
          </div>
          <div
            v-if="trialEndsAt"
            class="mt-4 flex items-start gap-2 rounded-[12px] border border-brand-primary/20 bg-brand-primary/5 p-3 text-sm text-brand-charcoal"
          >
            <font-awesome-icon :icon="['fas', 'circle-info']" class="h-4 w-4 mt-0.5 text-brand-primary shrink-0" aria-hidden="true" />
            <span>You're on a free trial. Billing starts on {{ new Date(trialEndsAt).toLocaleDateString() }}.</span>
          </div>
        </div>

        <!-- Active Add-ons -->
        <div class="card p-6">
          <h2 class="flex items-center gap-2 text-xl font-heading font-semibold text-brand-charcoal mb-4">
            <font-awesome-icon :icon="['fas', 'sliders']" class="h-4 w-4 text-brand-primary" aria-hidden="true" />
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
                  class="flex items-center gap-2 text-neutral-body"
                >
                  <font-awesome-icon :icon="['fas', 'check']" class="h-3.5 w-3.5 text-brand-success shrink-0" aria-hidden="true" />
                  {{ formatProductLineLabel(product) }}
                </p>
              </div>
              <p v-else class="text-neutral-body">No active subscription add-ons</p>
            </div>

            <div>
              <h3 class="text-sm font-semibold text-brand-charcoal mb-2">
                One-time purchases
              </h3>
              <div v-if="oneTimePurchaseProducts.length" class="space-y-2">
                <p
                  v-for="product in oneTimePurchaseProducts"
                  :key="product.id"
                  class="flex items-center gap-2 text-neutral-body"
                >
                  <font-awesome-icon :icon="['fas', 'check']" class="h-3.5 w-3.5 text-brand-success shrink-0" aria-hidden="true" />
                  {{ formatOneTimeLine(product, purchaseCount) }}
                </p>
              </div>
              <p v-else class="text-neutral-body">No one-time purchases</p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="card p-6">
          <h2 class="flex items-center gap-2 text-xl font-heading font-semibold text-brand-charcoal mb-4">
            <font-awesome-icon :icon="['fas', 'arrow-right-arrow-left']" class="h-4 w-4 text-brand-primary" aria-hidden="true" />
            Manage Subscription
          </h2>
          <div class="space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-neutral-border">
              <div>
                <p class="font-medium text-brand-charcoal">Plan &amp; add-ons</p>
                <p class="text-sm text-neutral-body">Change your base plan or add/remove add-ons. Takes effect next billing cycle.</p>
              </div>
              <router-link
                to="/billing/manage"
                class="btn-secondary inline-flex items-center justify-center shrink-0"
              >
                Manage plan
              </router-link>
            </div>
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p class="font-medium text-brand-charcoal">Payment &amp; invoices</p>
                <p class="text-sm text-neutral-body">Update your card, billing address, or download past invoices.</p>
              </div>
              <button
                type="button"
                :disabled="billingPortalLoading"
                @click="handleManageBilling"
                class="btn-primary inline-flex items-center justify-center gap-2 shrink-0 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <font-awesome-icon
                  v-if="billingPortalLoading"
                  :icon="['fas', 'spinner']"
                  spin
                  class="h-4 w-4"
                  aria-hidden="true"
                />
                <font-awesome-icon
                  v-else
                  :icon="['fas', 'arrow-up-right-from-square']"
                  class="h-4 w-4"
                  aria-hidden="true"
                />
                {{ billingPortalLoading ? 'Opening...' : 'Open Billing Portal' }}
              </button>
            </div>
            <p v-if="billingPortalError" class="text-sm text-red-600" role="alert">
              {{ billingPortalError }}
            </p>
          </div>
        </div>
      </div>
      <div v-else class="space-y-6">
        <div class="card p-6">
          <h2 class="flex items-center gap-2 text-xl font-heading font-semibold text-brand-charcoal mb-4">
            <font-awesome-icon :icon="['fas', 'crown']" class="h-4 w-4 text-brand-primary" aria-hidden="true" />
            Current Plan
          </h2>
          <div class="flex items-center gap-3 mb-4">
            <span class="text-lg font-semibold text-brand-charcoal">Free</span>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-bg border border-neutral-border text-neutral-body text-xs font-semibold">
              No active subscription
            </span>
          </div>
          <p class="text-sm text-neutral-body mb-4">
            You can search for jobs manually with capped credits and preview limited insights.
            Upgrade to unlock unlimited automated matching, full resume advice, and full Premium Insights.
          </p>
          <div class="flex flex-col sm:flex-row gap-3">
            <router-link
              to="/billing/manage"
              class="btn-primary inline-flex items-center justify-center"
            >
              Upgrade your plan
            </router-link>
            <router-link
              to="/pricing"
              class="btn-secondary inline-flex items-center justify-center"
            >
              Compare plans
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
