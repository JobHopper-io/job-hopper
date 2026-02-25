<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { subscriptionAPI, formatProductLineLabel } from '@/lib/subscription'
import { useUserStore } from '@/stores/user'
import type { Product } from '@/types/database'

const userStore = useUserStore()
const { addonProducts, trialEndsAt } = storeToRefs(userStore)

const allAddonProducts = ref<Product[]>([])
const selectedAddonIds = ref<string[]>([])
const isLoadingProducts = ref(true)
const checkoutLoading = ref(false)
const error = ref('')
const removeError = ref('')
const removingAddonIds = ref<string[]>([])
const confirmRemoveProduct = ref<Product | null>(null)

const ownedAddonIds = computed(() => new Set(addonProducts.value.map((p) => p.id)))

const availableAddons = computed(() =>
  allAddonProducts.value.filter((p) => !ownedAddonIds.value.has(p.id)),
)

const canCheckout = computed(
  () => selectedAddonIds.value.length > 0 && !checkoutLoading.value,
)

const formattedTrialEnd = computed<string | null>(() => {
  if (!trialEndsAt.value) return null
  try {
    return new Date(trialEndsAt.value).toLocaleDateString()
  } catch {
    return null
  }
})

function toggleAddon(productId: string, checked: boolean) {
  if (checked) {
    selectedAddonIds.value = [...selectedAddonIds.value, productId]
  } else {
    selectedAddonIds.value = selectedAddonIds.value.filter((id) => id !== productId)
  }
}

async function handleContinueToCheckout() {
  if (!canCheckout.value) return
  error.value = ''
  checkoutLoading.value = true
  try {
    const { error: addError } = await subscriptionAPI.addSubscriptionItems(
      selectedAddonIds.value,
    )

    if (addError) {
      console.error('Add-on update error:', addError)
      error.value = 'Unable to update your subscription. Please try again.'
      return
    }
  } catch (err) {
    console.error('Add-on update error:', err)
    error.value = 'An unexpected error occurred. Please try again.'
  } finally {
    checkoutLoading.value = false
  }
}

function openRemoveConfirm(product: Product) {
  removeError.value = ''
  confirmRemoveProduct.value = product
}

function closeRemoveConfirm() {
  confirmRemoveProduct.value = null
}

async function confirmRemoveAddon() {
  const product = confirmRemoveProduct.value
  if (!product || removingAddonIds.value.includes(product.id)) return

  removeError.value = ''
  removingAddonIds.value = [...removingAddonIds.value, product.id]
  closeRemoveConfirm()
  try {
    const { error: removeErrorResult } = await subscriptionAPI.removeSubscriptionItems([
      product.id,
    ])

    if (removeErrorResult) {
      console.error('Remove add-on error:', removeErrorResult)
      removeError.value =
        'Unable to remove this add-on from your subscription. Please try again.'
      return
    }
  } catch (err) {
    console.error('Remove add-on error:', err)
    removeError.value = 'An unexpected error occurred while removing the add-on.'
  } finally {
    removingAddonIds.value = removingAddonIds.value.filter((id) => id !== product.id)
  }
}

onMounted(async () => {
  isLoadingProducts.value = true
  const { data, error: fetchError } = await subscriptionAPI.getAddonProducts()
  isLoadingProducts.value = false
  if (fetchError) {
    error.value = 'Unable to load add-ons. Please try again.'
    return
  }
  allAddonProducts.value = data ?? []
})
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
      <div class="mb-6">
        <router-link
          to="/billing"
          class="text-sm text-brand-primary font-medium hover:underline"
        >
          ← Back to billing
        </router-link>
      </div>
      <h1 class="text-3xl font-heading font-bold text-brand-charcoal mb-2">
        Manage aSubscription
      </h1>
      <p class="text-neutral-body mb-2">
        Add or remove features to your subscription with add-ons.
      </p>
      <p
        v-if="formattedTrialEnd"
        class="text-sm text-neutral-body mb-8"
      >
        You are on a trial. Any subscription-based add-ons will be on trial until
        {{ formattedTrialEnd }}.
      </p>
      <p
        v-else
        class="text-sm text-neutral-body mb-8"
      >
        Any subscription-based add-ons you purchase will start billing immediately.
      </p>

      <div v-if="isLoadingProducts" class="text-center py-12">
        <svg
          class="animate-spin h-8 w-8 text-brand-primary mx-auto mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <p class="text-neutral-body">Loading add-ons...</p>
      </div>

      <div v-else class="space-y-6">
        <div class="card p-6" v-if="addonProducts.length">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">
            Current add-ons
          </h2>
          <div class="space-y-3">
            <div
              v-for="product in addonProducts"
              :key="product.id"
              class="flex items-center justify-between"
            >
              <div>
                <span class="font-medium text-brand-charcoal">{{
                  product.display_name
                }}</span>
                <span class="text-sm text-neutral-body block">
                  {{ formatProductLineLabel(product) }}
                  <span v-if="product.description"> — {{ product.description }}</span>
                </span>
              </div>
              <button
                type="button"
                class="btn-secondary text-sm"
                :disabled="removingAddonIds.includes(product.id)"
                @click="openRemoveConfirm(product)"
              >
                {{ removingAddonIds.includes(product.id) ? 'Removing...' : 'Remove' }}
              </button>
            </div>
          </div>
          <div
            v-if="removeError"
            class="mt-4 p-4 bg-red-50 border border-red-200 rounded-[12px]"
          >
            <p class="text-red-800 text-sm">{{ removeError }}</p>
          </div>
        </div>

        <div v-if="availableAddons.length === 0" class="card p-6">
          <p class="text-neutral-body mb-4">
            You have all available add-ons.
          </p>
          <router-link to="/billing" class="btn-primary inline-block">
            Back to billing
          </router-link>
        </div>

        <div v-else class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">
            Available add-ons
          </h2>
          <p class="text-sm text-neutral-body mb-6">
            Select the add-ons you want to add to your subscription.
          </p>
          <div class="space-y-3 mb-8">
            <label
              v-for="product in availableAddons"
              :key="product.id"
              class="flex items-start cursor-pointer"
            >
              <input
                :checked="selectedAddonIds.includes(product.id)"
                type="checkbox"
                class="mr-3 mt-1 w-4 h-4"
                @change="
                  (e) =>
                    toggleAddon(product.id, (e.target as HTMLInputElement).checked)
                "
              />
              <div>
                <span class="font-medium text-brand-charcoal">{{
                  product.display_name
                }}</span>
                <span class="text-sm text-neutral-body block">
                  {{ formatProductLineLabel(product) }}
                  <span v-if="product.description"> — {{ product.description }}</span>
                </span>
              </div>
            </label>
          </div>

          <div
            v-if="error"
            class="mb-4 p-4 bg-red-50 border border-red-200 rounded-[12px]"
          >
            <p class="text-red-800 text-sm">{{ error }}</p>
          </div>

          <div class="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              :disabled="!canCheckout"
              class="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              @click="handleContinueToCheckout"
            >
              <svg
                v-if="checkoutLoading"
                class="animate-spin h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                />
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              {{ checkoutLoading ? 'Adding to subscription...' : 'Add to subscription' }}
            </button>
            <router-link
              to="/billing"
              class="btn-secondary inline-flex items-center justify-center"
            >
              Cancel
            </router-link>
          </div>
        </div>
      </div>
    </div>

    <!-- Remove add-on confirmation modal -->
    <Teleport to="body">
      <div
        v-if="confirmRemoveProduct"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-remove-title"
        @keydown.escape="closeRemoveConfirm"
        @click.self="closeRemoveConfirm"
      >
        <div
          class="card p-6 max-w-md w-full shadow-xl"
          @click.stop
        >
          <h2
            id="confirm-remove-title"
            class="text-xl font-heading font-semibold text-brand-charcoal mb-2"
          >
            Remove add-on?
          </h2>
          <p class="text-neutral-body mb-6">
            Are you sure you would like to remove
            <strong>{{ confirmRemoveProduct.display_name }}</strong>
            from your subscription?
          </p>
          <div class="flex flex-col sm:flex-row gap-3 justify-end">
            <button
              type="button"
              class="btn-secondary order-2 sm:order-1"
              @click="closeRemoveConfirm"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn-primary order-1 sm:order-2"
              @click="confirmRemoveAddon"
            >
              Remove add-on
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
