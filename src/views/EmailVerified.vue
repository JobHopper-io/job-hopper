<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI } from '@/lib/auth'
import { profileAPI } from '@/lib/profile'
import AuthSplitPanel from '@/components/auth/AuthSplitPanel.vue'

const router = useRouter()
const isVerified = ref(false)
const isChecking = ref(true)
const isContinuing = ref(false)

onMounted(async () => {
  const { user } = await authAPI.getCurrentUser()
  isVerified.value = !!user
  isChecking.value = false
})

// This tab is the one that actually holds the new session (the confirmation link landed
// here), so it continues the user itself instead of asking them to go back to the
// original signup tab - cross-tab sync (broadcast/storage polling) turned out to be
// unreliable in practice (different origin/device, backgrounded-tab throttling, etc.),
// so don't depend on it for the primary path.
async function handleContinue() {
  isContinuing.value = true
  const { data: profile } = await profileAPI.getCurrentUserProfile()
  router.push(profile?.onboarding_completed ? '/dashboard' : '/onboarding')
}
</script>

<template>
  <AuthSplitPanel>
    <div class="text-center">
      <template v-if="isChecking">
        <p class="text-neutral-body">Verifying…</p>
      </template>

      <template v-else-if="isVerified">
        <div class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/10">
          <font-awesome-icon :icon="['fas', 'circle-check']" class="text-2xl text-brand-primary" aria-hidden="true" />
        </div>
        <h1 class="text-2xl font-heading font-bold text-brand-charcoal">You're verified!</h1>
        <p class="mt-2 mb-6 text-neutral-body">
          Let's finish setting up your profile.
        </p>
        <button
          type="button"
          class="btn-primary flex w-full items-center justify-center gap-2"
          :disabled="isContinuing"
          @click="handleContinue"
        >
          <font-awesome-icon v-if="isContinuing" :icon="['fas', 'spinner']" spin aria-hidden="true" />
          <span>{{ isContinuing ? 'Loading…' : 'Continue to set up your profile' }}</span>
          <font-awesome-icon v-if="!isContinuing" :icon="['fas', 'arrow-right']" class="text-xs" aria-hidden="true" />
        </button>
        <p class="mt-3 text-xs text-neutral-body">
          You can close your other Job-Hopper tab — this one will take you the rest of the way.
        </p>
      </template>

      <template v-else>
        <h1 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
          This link isn't valid
        </h1>
        <p class="text-neutral-body mb-6">
          This confirmation link may have expired or already been used. Please sign in, or sign up again to get a new one.
        </p>
        <router-link to="/login" class="btn-primary w-full inline-block text-center">
          Back to sign in
        </router-link>
      </template>
    </div>
  </AuthSplitPanel>
</template>
