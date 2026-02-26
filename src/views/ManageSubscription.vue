<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  subscriptionAPI,
  formatProductLineLabel,
  getProductPrice,
} from '@/lib/subscription'
import { useUserStore } from '@/stores/user'
import type { Product } from '@/types/database'

const userStore = useUserStore()
const {
  addonProducts,
  subscriptionAddonProducts,
  oneTimeAddonProducts,
  trialEndsAt,
  basePlan,
} = storeToRefs(userStore)

const allAddonProducts = ref<Product[]>([])
const basePlanProducts = ref<Product[]>([])
const selectedAddonIds = ref<string[]>([])
const selectedOneTimeIds = ref<string[]>([])
const selectedBasePlanId = ref<string | null>(null)
const isLoadingProducts = ref(true)
const checkoutLoading = ref(false)
const oneTimeCheckoutLoading = ref(false)
const changePlanLoading = ref(false)
const error = ref('')
const oneTimeError = ref('')
const removeError = ref('')
const changePlanError = ref('')
const removingAddonIds = ref<string[]>([])
const pendingAddonIds = ref<string[]>([])
const confirmRemoveProduct = ref<Product | null>(null)

const ownedAddonIds = computed(() => new Set(addonProducts.value.map((p) => p.id)))

const availableSubscriptionAddons = computed(() =>
  allAddonProducts.value.filter(
    (p) => p.category === 'subscription_addon' && !ownedAddonIds.value.has(p.id),
  ),
)

const availableOneTimeAddons = computed(() =>
  allAddonProducts.value.filter(
    (p) => p.category === 'one_time_addon' && !ownedAddonIds.value.has(p.id),
  ),
)

/** Subscription-type addon product IDs currently on the subscription (for modify-subscription payload). */
const currentSubscriptionAddonIds = computed(() =>
  subscriptionAddonProducts.value.map((p) => p.id),
)

const canChangePlan = computed(
  () =>
    !!selectedBasePlanId.value &&
    selectedBasePlanId.value !== basePlan.value?.id &&
    !changePlanLoading.value,
)

watch(addonProducts, (newAddonProducts) => {
  const ownedIds = new Set(newAddonProducts.map((p) => p.id))

  if (pendingAddonIds.value.length > 0) {
    const stillPending = pendingAddonIds.value.filter((id) => !ownedIds.has(id))

    if (stillPending.length === 0) {
      pendingAddonIds.value = []
      checkoutLoading.value = false
      selectedAddonIds.value = []
    } else {
      pendingAddonIds.value = stillPending
    }
  }

  if (removingAddonIds.value.length > 0) {
    removingAddonIds.value = removingAddonIds.value.filter((id) => ownedIds.has(id))
  }
})

watch(
  basePlan,
  (newBasePlan) => {
    if (newBasePlan && !changePlanLoading.value) {
      selectedBasePlanId.value = newBasePlan.id
    }
  },
  { immediate: true },
)

const canCheckout = computed(
  () => selectedAddonIds.value.length > 0 && !checkoutLoading.value,
)

const canPurchaseOneTime = computed(
  () => selectedOneTimeIds.value.length > 0 && !oneTimeCheckoutLoading.value,
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

function toggleOneTimeAddon(productId: string, checked: boolean) {
  if (checked) {
    selectedOneTimeIds.value = [...selectedOneTimeIds.value, productId]
  } else {
    selectedOneTimeIds.value = selectedOneTimeIds.value.filter((id) => id !== productId)
  }
}

async function handleContinueToCheckout() {
  if (!canCheckout.value || !basePlan.value) return
  error.value = ''
  checkoutLoading.value = true
  const requestedAddonIds = [...selectedAddonIds.value]

  try {
    const productIds = [
      basePlan.value.id,
      ...currentSubscriptionAddonIds.value,
      ...requestedAddonIds,
    ]
    const { error: modifyError } = await subscriptionAPI.modifySubscription(productIds)

    if (modifyError) {
      console.error('Add-on update error:', modifyError)
      error.value = 'Unable to update your subscription. Please try again.'
      checkoutLoading.value = false
      return
    }

    const ownedIds = new Set(addonProducts.value.map((p) => p.id))
    const notYetOwned = requestedAddonIds.filter((id) => !ownedIds.has(id))

    if (notYetOwned.length === 0) {
      checkoutLoading.value = false
      selectedAddonIds.value = []
    } else {
      pendingAddonIds.value = notYetOwned
    }
  } catch (err) {
    console.error('Add-on update error:', err)
    error.value = 'An unexpected error occurred. Please try again.'
    checkoutLoading.value = false
  }
}

async function handlePurchaseOneTimeUpgrades() {
  if (!canPurchaseOneTime.value) return

  oneTimeError.value = ''
  oneTimeCheckoutLoading.value = true

  const productIds = [...selectedOneTimeIds.value]

  try {
    const { data, error: checkoutError } = await subscriptionAPI.createCheckoutSession(
      productIds,
      `${window.location.origin}/billing/manage?session_id={CHECKOUT_SESSION_ID}`,
      `${window.location.origin}/billing/manage`,
    )

    if (checkoutError) {
      console.error('One-time checkout error:', checkoutError)
      oneTimeError.value =
        'Unable to start checkout for one-time upgrades. Please try again.'
      oneTimeCheckoutLoading.value = false
      return
    }

    if (data?.url) {
      window.location.href = data.url
      return
    }

    oneTimeCheckoutLoading.value = false
    oneTimeError.value = 'Unexpected response from checkout. Please try again.'
  } catch (err) {
    console.error('One-time checkout error:', err)
    oneTimeError.value = 'An unexpected error occurred. Please try again.'
    oneTimeCheckoutLoading.value = false
  }
}

async function handleChangeBasePlan() {
  if (!canChangePlan.value || !selectedBasePlanId.value) return

  changePlanError.value = ''
  changePlanLoading.value = true

  try {
    const productIds = [
      selectedBasePlanId.value,
      ...currentSubscriptionAddonIds.value,
    ]
    const { error: changeError } = await subscriptionAPI.modifySubscription(productIds)

    if (changeError) {
      console.error('Base plan change error:', changeError)
      changePlanError.value =
        'Unable to update your base plan right now. Please try again.'
      return
    }
  } catch (err) {
    console.error('Base plan change error:', err)
    changePlanError.value = 'An unexpected error occurred. Please try again.'
  } finally {
    changePlanLoading.value = false
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
  if (!product || removingAddonIds.value.includes(product.id) || !basePlan.value)
    return

  removeError.value = ''
  removingAddonIds.value = [...removingAddonIds.value, product.id]
  closeRemoveConfirm()
  try {
    const productIds = [
      basePlan.value.id,
      ...currentSubscriptionAddonIds.value.filter((id) => id !== product.id),
    ]
    const { error: removeErrorResult } =
      await subscriptionAPI.modifySubscription(productIds)

    if (removeErrorResult) {
      console.error('Remove add-on error:', removeErrorResult)
      removeError.value =
        'Unable to remove this add-on from your subscription. Please try again.'
      removingAddonIds.value = removingAddonIds.value.filter((id) => id !== product.id)
      return
    }
  } catch (err) {
    console.error('Remove add-on error:', err)
    removeError.value = 'An unexpected error occurred while removing the add-on.'
    removingAddonIds.value = removingAddonIds.value.filter((id) => id !== product.id)
  }
}

onMounted(async () => {
  isLoadingProducts.value = true
  try {
    const [addonRes, baseRes] = await Promise.all([
      subscriptionAPI.getAddonProducts(),
      subscriptionAPI.getBasePlanProducts(),
    ])

    if (addonRes.error) {
      error.value = 'Unable to load add-ons. Please try again.'
    } else {
      allAddonProducts.value = addonRes.data ?? []
    }

    if (baseRes.error) {
      changePlanError.value =
        'Unable to load available subscription plans. Please try again later.'
    } else {
      basePlanProducts.value = baseRes.data ?? []
      if (!selectedBasePlanId.value && basePlan.value) {
        selectedBasePlanId.value = basePlan.value.id
      }
    }
  } catch (err) {
    console.error('Error loading subscription data:', err)
    error.value = 'Unable to load subscription options. Please try again.'
  } finally {
    isLoadingProducts.value = false
  }
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
        Manage Subscription
      </h1>
      <p class="text-neutral-body mb-2">
        View your current plan, change tiers, and manage add-ons.
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
        <font-awesome-icon
          :icon="['fas', 'spinner']"
          spin
          class="h-8 w-8 text-brand-primary mx-auto mb-4"
          aria-hidden="true"
        />
        <p class="text-neutral-body">Loading add-ons...</p>
      </div>

      <div v-else class="space-y-6">
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">
            Base plan
          </h2>
          <div class="space-y-2 mb-4">
            <p
              v-if="basePlan"
              class="text-neutral-body"
            >
              <span class="font-semibold">Current plan:</span>
              {{ basePlan.display_name }}
            </p>
            <p
              v-if="basePlan"
              class="text-neutral-body"
            >
              <span class="font-semibold">Monthly price:</span>
              <span> ${{ getProductPrice(basePlan) }}/month</span>
            </p>
            <p
              v-else
              class="text-neutral-body"
            >
              You don't have an active base plan yet.
            </p>
          </div>

          <div v-if="basePlanProducts.length" class="mt-2 space-y-4">
            <h3 class="text-sm font-semibold text-brand-charcoal">
              Change your base plan
            </h3>
            <div class="space-y-3">
              <label
                v-for="product in basePlanProducts"
                :key="product.id"
                class="flex items-start cursor-pointer"
              >
                <input
                  v-model="selectedBasePlanId"
                  type="radio"
                  class="mr-3 mt-1 w-4 h-4"
                  :value="product.id"
                  :disabled="changePlanLoading"
                />
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-brand-charcoal">
                      {{ product.display_name }}
                    </span>
                    <span
                      v-if="basePlan && product.id === basePlan.id"
                      class="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-semibold"
                    >
                      <font-awesome-icon
                        :icon="['fas', 'check']"
                        class="w-3 h-3 mr-1"
                        aria-hidden="true"
                      />
                      Current plan
                    </span>
                  </div>
                  <span class="text-sm text-neutral-body block">
                    ${{ getProductPrice(product) }}/month
                    <span v-if="product.description"> — {{ product.description }}</span>
                  </span>
                </div>
              </label>
            </div>

            <div class="flex flex-col sm:flex-row gap-3 mt-4">
              <button
                type="button"
                class="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!canChangePlan"
                @click="handleChangeBasePlan"
              >
                <font-awesome-icon
                  v-if="changePlanLoading"
                  :icon="['fas', 'spinner']"
                  spin
                  class="h-5 w-5"
                  aria-hidden="true"
                />
                {{
                  changePlanLoading
                    ? 'Updating plan...'
                    : basePlan
                      ? 'Update base plan'
                      : 'Choose base plan'
                }}
              </button>
            </div>

            <p
              v-if="changePlanError"
              class="mt-4 text-sm text-red-600"
              role="alert"
            >
              {{ changePlanError }}
            </p>
          </div>
          <p
            v-else
            class="text-sm text-neutral-body"
          >
            No other base plans are available right now.
          </p>
        </div>

        <div class="card p-6" v-if="subscriptionAddonProducts.length || oneTimeAddonProducts.length">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">
            Current add-ons
          </h2>
          <div class="space-y-4">
            <div v-if="subscriptionAddonProducts.length" class="space-y-3">
              <h3 class="text-sm font-semibold text-brand-charcoal">
                Subscription add-ons
              </h3>
              <div
                v-for="product in subscriptionAddonProducts"
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
                  class="inline-flex items-center justify-center w-8 h-8 rounded-full text-red-600 hover:text-red-700 hover:bg-red-50 disabled:text-red-300 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  :disabled="removingAddonIds.includes(product.id)"
                  @click="openRemoveConfirm(product)"
                  :aria-label="'Remove ' + product.display_name"
                  :title="'Remove ' + product.display_name"
                >
                  <font-awesome-icon
                    v-if="!removingAddonIds.includes(product.id)"
                    :icon="['fas', 'trash']"
                    class="w-5 h-5"
                    aria-hidden="true"
                  />
                  <font-awesome-icon
                    v-else
                    :icon="['fas', 'spinner']"
                    spin
                    class="w-5 h-5 text-red-500"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>

            <div v-if="oneTimeAddonProducts.length" class="space-y-3">
              <h3 class="text-sm font-semibold text-brand-charcoal">
                One-time upgrades
              </h3>
              <div
                v-for="product in oneTimeAddonProducts"
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
              </div>
            </div>
          </div>
          <div
            v-if="removeError"
            class="mt-4 p-4 bg-red-50 border border-red-200 rounded-[12px]"
          >
            <p class="text-red-800 text-sm">{{ removeError }}</p>
          </div>
        </div>

        <div v-if="availableSubscriptionAddons.length === 0" class="card p-6">
          <p class="text-neutral-body mb-4">
            You have all available subscription add-ons.
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
              v-for="product in availableSubscriptionAddons"
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
              <font-awesome-icon
                v-if="checkoutLoading"
                :icon="['fas', 'spinner']"
                spin
                class="h-5 w-5"
                aria-hidden="true"
              />
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

        <div
          v-if="oneTimeAddonProducts.length || availableOneTimeAddons.length"
          class="card p-6"
        >
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">
            One-time upgrades
          </h2>
          <p class="text-sm text-neutral-body mb-6">
            These upgrades are single-purchase items and do not change your monthly
            subscription price.
          </p>

          <div v-if="oneTimeAddonProducts.length" class="space-y-3 mb-6">
            <h3 class="text-sm font-semibold text-brand-charcoal">
              Already purchased
            </h3>
            <div
              v-for="product in oneTimeAddonProducts"
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
            </div>
          </div>

          <div class="space-y-3 mb-6">
            <h3 class="text-sm font-semibold text-brand-charcoal">
              Available one-time upgrades
            </h3>
            <div v-if="availableOneTimeAddons.length" class="space-y-3">
              <label
                v-for="product in availableOneTimeAddons"
                :key="product.id"
                class="flex items-start cursor-pointer"
              >
                <input
                  :checked="selectedOneTimeIds.includes(product.id)"
                  type="checkbox"
                  class="mr-3 mt-1 w-4 h-4"
                  @change="
                    (e) =>
                      toggleOneTimeAddon(product.id, (e.target as HTMLInputElement).checked)
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
            <p v-else class="text-neutral-body">
              No additional one-time upgrades are available right now.
            </p>
          </div>

          <div
            v-if="oneTimeError"
            class="mb-4 p-4 bg-red-50 border border-red-200 rounded-[12px]"
          >
            <p class="text-red-800 text-sm">{{ oneTimeError }}</p>
          </div>

          <div class="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              :disabled="!canPurchaseOneTime"
              class="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              @click="handlePurchaseOneTimeUpgrades"
            >
              <font-awesome-icon
                v-if="oneTimeCheckoutLoading"
                :icon="['fas', 'spinner']"
                spin
                class="h-5 w-5"
                aria-hidden="true"
              />
              {{
                oneTimeCheckoutLoading
                  ? 'Starting checkout...'
                  : 'Purchase selected upgrades'
              }}
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
