<template>
  <div class="min-h-screen bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md mx-auto">
      <div class="card p-8 text-center">
        <template v-if="state === 'loading'">
          <font-awesome-icon :icon="['fas', 'spinner']" spin class="text-3xl text-brand-charcoal mb-4" />
          <p class="text-neutral-body">Checking your invite link…</p>
        </template>

        <template v-else-if="state === 'valid'">
          <font-awesome-icon :icon="['fas', 'circle-check']" class="text-4xl text-green-600 mb-4" />
          <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-3">
            You're invited{{ organizationName ? ` via ${organizationName}` : '' }}
          </h1>
          <p class="text-neutral-body mb-6">
            Create your account to activate your {{ tierLabel }} access.
          </p>
          <router-link to="/register" class="btn-primary w-full inline-block text-center">
            Continue to sign up
          </router-link>
        </template>

        <template v-else>
          <font-awesome-icon :icon="['fas', 'exclamation-triangle']" class="text-4xl text-amber-500 mb-4" />
          <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-3">Invite link not valid</h1>
          <p class="text-neutral-body mb-6">{{ errorMessage }}</p>
          <router-link to="/register" class="btn-primary w-full inline-block text-center">
            Sign up anyway
          </router-link>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { trialInviteAPI } from '@/lib/trialInvite'

const route = useRoute()

const state = ref<'loading' | 'valid' | 'invalid'>('loading')
const organizationName = ref('')
const featureTier = ref<'free' | 'core' | 'premium'>('free')
const errorMessage = ref('This invite link is not valid.')

const tierLabel = computed(() => {
  if (featureTier.value === 'premium') return 'Premium'
  if (featureTier.value === 'core') return 'Core'
  return 'Free'
})

onMounted(async () => {
  const code = typeof route.params.code === 'string' ? route.params.code : ''
  if (!code) {
    state.value = 'invalid'
    return
  }

  const { data, error } = await trialInviteAPI.resolve(code)

  if (error || !data?.valid) {
    errorMessage.value = data?.error || error?.message || 'This invite link is not valid.'
    state.value = 'invalid'
    return
  }

  organizationName.value = data.organizationName ?? ''
  featureTier.value = data.featureTier ?? 'free'

  try {
    sessionStorage.setItem('trial_invite_code', code)
  } catch {
    // sessionStorage unavailable (privacy mode, etc.) - the code just won't carry
    // through to signup; the invite link itself still resolved successfully.
  }

  state.value = 'valid'
})
</script>
