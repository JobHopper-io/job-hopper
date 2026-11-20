<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { maskEmail, previewUnsubscribeToken, unsubscribeAPI } from '@/lib/unsubscribe'

// Landing page for email unsubscribe links. Opening the link changes nothing (so mail
// scanners that prefetch links can't unsubscribe anyone); the button does.
const route = useRoute()
// Read the token once and keep it in component state only; it's removed from the URL on
// mount so it doesn't linger in the address bar, history, or a copied/shared link.
const token = ref<string | null>(typeof route.query.token === 'string' ? route.query.token : null)
const preview = computed(() => previewUnsubscribeToken(token.value))
const maskedEmail = computed(() => (preview.value?.email ? maskEmail(preview.value.email) : null))

onMounted(() => {
  if (window.location.search) {
    // Keep vue-router's history.state so back/forward still work.
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }
})

type PageState = 'ready' | 'submitting' | 'done' | 'invalid' | 'error'
const result = ref<PageState | null>(null)
const state = computed<PageState>(() => {
  if (result.value) return result.value
  if (!preview.value || preview.value.expired) return 'invalid'
  return 'ready'
})

const what = computed(() =>
  preview.value?.scope === 'marketing' ? 'marketing emails' : 'all Job-Hopper emails',
)

async function confirm() {
  if (!token.value) return
  result.value = 'submitting'
  const { status } = await unsubscribeAPI.confirm(token.value)
  result.value = status
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md mx-auto">
      <div class="card p-8 text-center">
        <template v-if="state === 'done'">
          <font-awesome-icon :icon="['fas', 'circle-check']" class="text-4xl text-green-600 mb-6" aria-hidden="true" />
          <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-3">You’re unsubscribed</h1>
          <p class="text-neutral-body mb-6">
            <template v-if="maskedEmail"><strong>{{ maskedEmail }}</strong> won’t get {{ what }} from us anymore.</template>
            <template v-else>You won’t get {{ what }} from us anymore.</template>
            If you have an account, you can change this anytime in your profile.
          </p>
          <router-link to="/" class="btn-primary w-full inline-block text-center">Back to home</router-link>
        </template>

        <template v-else-if="state === 'invalid'">
          <font-awesome-icon :icon="['fas', 'exclamation-triangle']" class="text-4xl text-amber-500 mb-6" aria-hidden="true" />
          <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-3">This link has expired or isn’t valid</h1>
          <p class="text-neutral-body mb-6">
            Use the unsubscribe link from a more recent email, or sign in and turn emails off in your profile.
          </p>
          <router-link to="/profile" class="btn-primary w-full inline-block text-center">Go to email preferences</router-link>
        </template>

        <template v-else>
          <font-awesome-icon :icon="['fas', 'envelope']" class="text-4xl text-brand-primary mb-6" aria-hidden="true" />
          <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-3">Unsubscribe?</h1>
          <p class="text-neutral-body mb-6">
            <template v-if="maskedEmail"><strong>{{ maskedEmail }}</strong> will stop getting {{ what }}.</template>
            <template v-else>This address will stop getting {{ what }}.</template>
          </p>
          <p v-if="state === 'error'" class="text-sm text-red-600 mb-4" role="alert">
            Something went wrong. Please try again.
          </p>
          <button
            type="button"
            class="btn-primary w-full"
            :disabled="state === 'submitting'"
            @click="confirm"
          >
            <font-awesome-icon v-if="state === 'submitting'" :icon="['fas', 'spinner']" spin class="mr-2" aria-hidden="true" />
            Unsubscribe
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
