<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI, onAuthStateChange } from '@/lib/auth'
import { profileAPI } from '@/lib/profile'
import AuthSplitPanel from '@/components/auth/AuthSplitPanel.vue'

const router = useRouter()
const hasNavigated = ref(false)

async function goToDestination() {
  if (hasNavigated.value) return
  hasNavigated.value = true
  const { data: profile } = await profileAPI.getCurrentUserProfile()
  if (profile?.onboarding_completed) {
    router.push('/dashboard')
  } else {
    router.push('/onboarding')
  }
}

async function checkIfVerified() {
  const { user } = await authAPI.getCurrentUser()
  if (user) {
    await goToDestination()
  }
}

// Verification happens in a different tab (the email link). Supabase syncs the new
// session to this tab via a cross-tab broadcast, so listen for it here instead of only
// checking once on mount.
const {
  data: { subscription: authListener },
} = onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    await goToDestination()
  }
})

// Belt-and-suspenders fallback: the broadcast above doesn't fire in every browser
// (e.g. Safari private browsing blocks BroadcastChannel outright), so also poll
// periodically in case this tab misses the event.
const pollId = window.setInterval(checkIfVerified, 3000)

// The realistic path through this page is: user leaves this tab, verifies in the email
// tab, then comes back - and this tab has been backgrounded that whole time. Browsers
// throttle/suspend setInterval timers (and can delay BroadcastChannel delivery) for
// hidden tabs, so neither of the above can be trusted to have fired promptly while the
// user was away. Re-check immediately the moment this tab is actually looked at again.
function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void checkIfVerified()
  }
}
document.addEventListener('visibilitychange', handleVisibilityChange)

onUnmounted(() => {
  authListener.unsubscribe()
  window.clearInterval(pollId)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

onMounted(checkIfVerified)
</script>

<template>
  <AuthSplitPanel>
    <div class="text-center">
      <div class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/10">
        <font-awesome-icon :icon="['fas', 'envelope']" class="text-2xl text-brand-primary" aria-hidden="true" />
      </div>
      <h1 class="text-2xl font-heading font-bold text-brand-charcoal">Check your email</h1>
      <p class="mt-2 mb-2 text-neutral-body">
        Click the confirmation link we sent you — it'll open a new tab and take you straight into
        setting up your profile.
      </p>
      <p class="mb-6 text-xs text-neutral-body">
        Don't see it? Check spam.
      </p>
      <router-link to="/login" class="btn-secondary inline-block w-full text-center">
        Back to sign in
      </router-link>
    </div>
  </AuthSplitPanel>
</template>
