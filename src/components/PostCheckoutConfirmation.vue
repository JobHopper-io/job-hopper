<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/bodyScrollLock'

const props = withDefaults(
  defineProps<{
    /** Route name for the "Go to dashboard" button. */
    goToRouteName?: string
  }>(),
  {
    goToRouteName: 'dashboard',
  },
)

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const { hasActiveSubscription, basePlan } = storeToRefs(userStore)

const visible = ref(false)
const confirmed = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null

/** Stripe webhooks land within a second or two; cap polling so a stuck webhook doesn't spin forever. */
const MAX_POLL_ATTEMPTS = 10
const POLL_INTERVAL_MS = 1500

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function pollForConfirmation() {
  let attempts = 0
  const check = async () => {
    attempts++
    await userStore.refreshSubscription()
    if (hasActiveSubscription.value || attempts >= MAX_POLL_ATTEMPTS) {
      confirmed.value = true
      stopPolling()
    }
  }
  await check()
  if (!confirmed.value) {
    pollTimer = setInterval(check, POLL_INTERVAL_MS)
  }
}

onMounted(() => {
  const sessionId = route.query.session_id
  if (typeof sessionId !== 'string' || !sessionId) return

  visible.value = true
  lockBodyScroll()

  const restQuery = { ...route.query }
  delete restQuery.session_id
  void router.replace({ query: restQuery })

  void pollForConfirmation()
})

onUnmounted(() => {
  stopPolling()
  if (visible.value) unlockBodyScroll()
})

function goToDashboard() {
  visible.value = false
  unlockBodyScroll()
  void router.push({ name: props.goToRouteName })
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="status"
      aria-live="polite"
    >
      <div class="card w-full max-w-md p-8 text-center">
        <template v-if="!confirmed">
          <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/10">
            <font-awesome-icon
              :icon="['fas', 'spinner']"
              spin
              class="h-6 w-6 text-brand-primary"
              aria-hidden="true"
            />
          </div>
          <h2 class="font-heading text-xl font-semibold text-brand-charcoal">Payment received</h2>
          <p class="mt-2 text-sm text-neutral-body">Setting up your account…</p>
          <p class="mt-4 text-xs text-neutral-body">This usually takes a few seconds</p>
        </template>
        <template v-else>
          <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
            <font-awesome-icon :icon="['fas', 'circle-check']" class="h-7 w-7 text-green-700" aria-hidden="true" />
          </div>
          <h2 class="font-heading text-xl font-semibold text-brand-charcoal">
            You're on {{ basePlan?.display_name ?? 'your new plan' }}
          </h2>
          <p class="mt-2 text-sm text-neutral-body">Your subscription is active. Here's what's next.</p>
          <button type="button" class="btn-primary mt-6 inline-block" @click="goToDashboard">
            Go to dashboard
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>
