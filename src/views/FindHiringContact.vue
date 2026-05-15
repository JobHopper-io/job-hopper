<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { authAPI, onAuthStateChange } from '@/lib/auth'
import {
  publicFindHiringContact,
  type PublicTeaserLookupResponse,
} from '@/lib/publicHiringContactTeaser'

type Phase = 'email' | 'code' | 'lookup'

const phase = ref<Phase>('email')
const sessionReady = ref(false)

const email = ref('')
const otpCode = ref('')

const companyName = ref('')
const jobTitle = ref('')
const jobDescription = ref('')

const isSendingCode = ref(false)
const isVerifying = ref(false)
const isLookupLoading = ref(false)
const errorMsg = ref('')

const result = ref<PublicTeaserLookupResponse | null>(null)

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function refreshSession() {
  const { user } = await authAPI.getCurrentUser()
  const ok = !!user?.email
  sessionReady.value = ok
  if (ok) {
    phase.value = 'lookup'
    email.value = user!.email ?? email.value
  }
}

const {
  data: { subscription: authTeaserListener },
} = onAuthStateChange(() => {
  void refreshSession()
})

const canSendCode = computed(
  () => emailRegex.test(email.value.trim()) && !isSendingCode.value,
)

onMounted(async () => {
  await refreshSession()
})

onUnmounted(() => {
  authTeaserListener.unsubscribe()
})

async function sendCode() {
  errorMsg.value = ''
  if (!canSendCode.value) return
  isSendingCode.value = true
  try {
    const { error } = await authAPI.signInWithEmailOtp(email.value.trim())
    if (error) {
      errorMsg.value = error.message || 'Could not send the verification email.'
      return
    }
    phase.value = 'code'
  } finally {
    isSendingCode.value = false
  }
}

async function verifyCode() {
  errorMsg.value = ''
  const tok = otpCode.value.trim()
  if (!tok) {
    errorMsg.value = 'Enter the code from your email.'
    return
  }
  isVerifying.value = true
  try {
    const { error } = await authAPI.verifyEmailOtp(email.value.trim(), tok)
    if (error) {
      errorMsg.value = error.message || 'Invalid or expired code.'
      return
    }
    await refreshSession()
  } finally {
    isVerifying.value = false
  }
}

async function runLookup() {
  errorMsg.value = ''
  result.value = null
  const co = companyName.value.trim()
  const ti = jobTitle.value.trim()
  if (!co || !ti) {
    errorMsg.value = 'Company name and job title are required.'
    return
  }
  isLookupLoading.value = true
  try {
    const { data, error } = await publicFindHiringContact({
      company_name: co,
      job_title: ti,
      job_description: jobDescription.value.trim() || undefined,
    })
    if (error) {
      errorMsg.value = error.message || 'Lookup failed.'
      return
    }
    result.value = data ?? null
    if (data?.error === 'quota_exhausted') {
      errorMsg.value = ''
    }
  } finally {
    isLookupLoading.value = false
  }
}

function signOutTeaser() {
  void authAPI.signOut().then(() => {
    sessionReady.value = false
    phase.value = 'email'
    otpCode.value = ''
    result.value = null
  })
}

const revealContacts = computed(() => result.value?.reveal_contact_details === true)

const showLockedContacts = computed(() => {
  const r = result.value?.row
  return r?.status === 'found' && !revealContacts.value
})

const maskedEmail = '████████@██████.███'
const maskedLinkedIn = 'linkedin.com/in/••••••••'

function displayEmail(r: { email?: string | null }) {
  return revealContacts.value && r.email ? r.email : maskedEmail
}

function displayLinkedIn(r: { linkedin_url?: string | null }) {
  return revealContacts.value && r.linkedin_url ? r.linkedin_url : maskedLinkedIn
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-10 px-4 sm:px-6 lg:px-8">
    <div class="max-w-xl mx-auto">
      <h1 class="text-3xl font-heading font-bold text-brand-charcoal mb-2">
        Preview a hiring contact
      </h1>
      <p class="text-neutral-body text-sm mb-8">
        Verify your email for a limited free preview (name &amp; title). Email and LinkedIn stay locked until you subscribe.
      </p>

      <!-- Email gate -->
      <div v-if="!sessionReady && phase === 'email'" class="card p-6 space-y-4">
        <label class="block text-sm font-medium text-brand-charcoal">Work email</label>
        <input v-model="email" type="email" autocomplete="email" class="input" placeholder="you@company.com" />
        <button type="button" class="btn-primary w-full" :disabled="!canSendCode" @click="sendCode">
          <font-awesome-icon v-if="isSendingCode" :icon="['fas', 'spinner']" spin class="mr-2" aria-hidden="true" />
          Send verification code
        </button>
        <p class="text-xs text-neutral-body">
          We’ll email you a one-time code. No password needed for this preview.
        </p>
      </div>

      <div v-else-if="!sessionReady && phase === 'code'" class="card p-6 space-y-4">
        <p class="text-sm text-neutral-body">
          Enter the code we sent to <span class="font-medium text-brand-charcoal">{{ email }}</span>.
        </p>
        <input v-model="otpCode" type="text" inputmode="numeric" autocomplete="one-time-code" class="input text-lg tracking-widest" placeholder="000000" maxlength="12" />
        <button type="button" class="btn-primary w-full" :disabled="isVerifying" @click="verifyCode">
          <font-awesome-icon v-if="isVerifying" :icon="['fas', 'spinner']" spin class="mr-2" aria-hidden="true" />
          Verify &amp; continue
        </button>
        <button type="button" class="text-sm text-brand-primary hover:underline" @click="phase = 'email'">
          Use a different email
        </button>
      </div>

      <!-- Lookup -->
      <div v-else class="space-y-6">
        <div class="flex justify-between items-start gap-4">
          <p class="text-sm text-neutral-body">
            Signed in as <span class="font-medium text-brand-charcoal">{{ email }}</span>
          </p>
          <button type="button" class="text-xs text-neutral-body hover:text-brand-charcoal underline" @click="signOutTeaser">
            Sign out
          </button>
        </div>

        <div class="card p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-brand-charcoal mb-1">Company name</label>
            <input v-model="companyName" type="text" class="input" placeholder="Acme Manufacturing" />
            <p class="text-xs text-neutral-body mt-1">Use at least two meaningful words (spam guard).</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-brand-charcoal mb-1">Job title</label>
            <input v-model="jobTitle" type="text" class="input" placeholder="Maintenance Supervisor" />
          </div>
          <div>
            <label class="block text-sm font-medium text-brand-charcoal mb-1">Job description <span class="text-neutral-body font-normal">(optional)</span></label>
            <textarea v-model="jobDescription" class="input min-h-[100px]" placeholder="Paste a short excerpt to improve role matching…" />
          </div>
          <button type="button" class="btn-primary w-full" :disabled="isLookupLoading" @click="runLookup">
            <font-awesome-icon v-if="isLookupLoading" :icon="['fas', 'spinner']" spin class="mr-2" aria-hidden="true" />
            Find hiring contact
          </button>
        </div>

        <div v-if="result?.error === 'quota_exhausted'" class="card p-6 border border-brand-primary/30 bg-white">
          <p class="font-heading font-semibold text-brand-charcoal mb-2">
            You’ve used your free previews
          </p>
          <p class="text-sm text-neutral-body mb-4">
            Subscribe to unlock full email and LinkedIn on your matches (and unlimited in-app lookups).
          </p>
          <router-link to="/pricing" class="btn-primary inline-block text-center">
            View plans
          </router-link>
        </div>

        <div v-else-if="result?.row" class="card p-6 space-y-4">
          <template v-if="result.row.status === 'found'">
            <p class="text-xs font-semibold uppercase tracking-wide text-brand-primary">Likely hiring contact</p>
            <p class="text-lg font-heading font-bold text-brand-charcoal">
              {{ result.row.full_name || 'Name unavailable' }}
            </p>
            <p class="text-neutral-body">{{ result.row.title }}</p>
            <p v-if="result.company_name" class="text-sm text-neutral-body">
              {{ result.company_name }}
            </p>

            <div class="space-y-3 pt-2 border-t border-neutral-border">
              <div class="relative rounded-lg bg-neutral-bg px-3 py-2 overflow-hidden">
                <p class="text-xs text-neutral-body mb-1">Email</p>
                <p
                  class="text-sm font-mono text-brand-charcoal"
                  :class="{ 'blur-sm select-none': showLockedContacts }"
                >
                  {{ displayEmail(result.row) }}
                </p>
                <div
                  v-if="showLockedContacts"
                  class="absolute inset-0 flex items-center justify-center bg-white/40 pointer-events-none"
                >
                  <font-awesome-icon :icon="['fas', 'lock']" class="text-brand-charcoal text-xl opacity-70" aria-hidden="true" />
                </div>
              </div>
              <div class="relative rounded-lg bg-neutral-bg px-3 py-2 overflow-hidden">
                <p class="text-xs text-neutral-body mb-1">LinkedIn</p>
                <p
                  class="text-sm font-mono text-brand-primary truncate"
                  :class="{ 'blur-sm select-none': showLockedContacts }"
                >
                  {{ displayLinkedIn(result.row) }}
                </p>
                <div
                  v-if="showLockedContacts"
                  class="absolute inset-0 flex items-center justify-center bg-white/40 pointer-events-none"
                >
                  <font-awesome-icon :icon="['fas', 'lock']" class="text-brand-charcoal text-xl opacity-70" aria-hidden="true" />
                </div>
              </div>
            </div>

            <div v-if="showLockedContacts" class="pt-2">
              <router-link to="/pricing" class="btn-primary inline-block text-center w-full sm:w-auto">
                Subscribe to unlock contact details
              </router-link>
              <p class="text-xs text-neutral-body mt-2">
                Trial and paid plans include hiring-contact lookups on jobs we match for you.
              </p>
            </div>
            <p v-if="result.cached" class="text-xs text-neutral-body">Cached result — instant replay.</p>
            <p v-if="result.quota && !revealContacts" class="text-xs text-neutral-body">
              Previews used: {{ result.quota.used }} / {{ result.quota.limit }}
            </p>
          </template>

          <template v-else-if="result.row.status === 'not_found'">
            <p class="font-medium text-brand-charcoal">We couldn’t find a likely hiring contact</p>
            <p class="text-sm text-neutral-body">
              Try a clearer company legal name or a different spelling. Small employers sometimes have no domain in our data source.
            </p>
            <p v-if="result.quota && !revealContacts" class="text-xs text-neutral-body">
              Previews used: {{ result.quota.used }} / {{ result.quota.limit }}
            </p>
          </template>

          <template v-else-if="result.row.status === 'error'">
            <p class="font-medium text-brand-charcoal">Lookup unavailable</p>
            <p class="text-sm text-neutral-body">
              {{ result.row.error_message || 'Please try again later.' }}
            </p>
          </template>
        </div>

        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
      </div>
    </div>
  </div>
</template>
