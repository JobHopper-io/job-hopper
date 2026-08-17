<script setup lang="ts">
import { ref } from 'vue'
import { partnerLeadsAPI } from '@/lib/partnerLeads'

const formData = ref({
  organizationName: '',
  email: '',
  name: '',
  title: '',
})

const isSubmitting = ref(false)
const isSubmitted = ref(false)
const submitError = ref<string | null>(null)

const handleSubmit = async () => {
  isSubmitting.value = true
  submitError.value = null

  const { error } = await partnerLeadsAPI.submit({
    organizationName: formData.value.organizationName.trim(),
    category: 'university',
    email: formData.value.email.trim(),
    name: formData.value.name.trim(),
    title: formData.value.title.trim(),
  })

  isSubmitting.value = false
  if (error) {
    submitError.value = error.message
    return
  }
  isSubmitted.value = true
  formData.value = { organizationName: '', email: '', name: '', title: '' }
}

const valuePoints = [
  {
    icon: 'shield-halved',
    title: 'Verified sponsorship signal',
    body: "Every match is checked against real H-1B and PERM filing history, not a guessed 'sponsors visas' tag — so students stop spending applications on employers who never actually sponsor.",
  },
  {
    icon: 'clipboard-list',
    title: 'Real hiring intel, not scraped guesses',
    body: 'Students see verified hiring-contact and filing data behind every match, sourced from DOL and USCIS records — the same data your office would otherwise have to look up one employer at a time.',
  },
  {
    icon: 'graduation-cap',
    title: 'Built-in interview prep',
    body: 'AI-powered mock interviews and a skill-gap breakdown, so a student walks into a real interview already knowing what to practice — not figuring it out after a rejection.',
  },
]
</script>

<template>
  <div class="min-h-screen bg-[#fff7ed] py-20 px-4 sm:px-6 lg:px-8">
    <div class="max-w-6xl mx-auto">
      <!-- Hero -->
      <section class="mb-16 text-center">
        <p class="text-sm font-semibold uppercase tracking-wide text-brand-primary mb-3">
          For career services &amp; international student offices
        </p>
        <h1 class="text-brand-charcoal mb-6">
          Give your students real sponsorship data — not guesswork.
        </h1>
        <p class="text-xl text-neutral-body max-w-3xl mx-auto">
          Job-Hopper matches international students and visa-seeking grads to employers
          that actually sponsor, verified against real DOL and USCIS filing data instead
          of a crowdsourced guess.
        </p>
      </section>

      <!-- Value points -->
      <section class="mb-16">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div v-for="point in valuePoints" :key="point.title" class="card p-8 text-left">
            <div
              class="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-4"
            >
              <font-awesome-icon :icon="['fas', point.icon]" />
            </div>
            <h3 class="text-lg font-heading font-semibold text-brand-charcoal mb-2">
              {{ point.title }}
            </h3>
            <p class="text-sm text-neutral-body leading-relaxed">{{ point.body }}</p>
          </div>
        </div>
      </section>

      <!-- Campus license framing -->
      <section class="mb-16 text-center">
        <h2 class="font-heading font-semibold text-brand-charcoal text-2xl mb-3">
          Sized to your enrollment
        </h2>
        <p class="text-neutral-body max-w-2xl mx-auto">
          A campus license scales with your student population — no per-seat guessing.
          Tell us about your office below and we'll follow up with real numbers, no
          pitch attached.
        </p>
      </section>

      <!-- Form -->
      <section class="max-w-xl mx-auto">
        <div v-if="isSubmitted" class="card p-8 bg-green-50 border-green-200">
          <div class="flex items-start">
            <font-awesome-icon
              :icon="['fas', 'circle-check']"
              class="text-green-600 text-xl mr-3 flex-shrink-0 mt-0.5"
            />
            <div>
              <h3 class="text-lg font-semibold text-green-900 mb-2">
                Thanks — we've got your request.
              </h3>
              <p class="text-green-800">
                Someone from our team will follow up with campus pricing shortly.
              </p>
            </div>
          </div>
        </div>

        <form v-else @submit.prevent="handleSubmit" class="card p-8 space-y-6">
          <div v-if="submitError" class="flex items-start gap-3 p-4 rounded-[12px] bg-red-50 border border-red-200">
            <font-awesome-icon :icon="['fas', 'exclamation-triangle']" class="text-red-600 mt-0.5 flex-shrink-0" />
            <p class="text-sm text-red-800">{{ submitError }}</p>
          </div>

          <div>
            <label for="organizationName" class="block text-sm font-medium text-brand-charcoal mb-2">
              School / institution name
            </label>
            <input
              id="organizationName"
              v-model="formData.organizationName"
              type="text"
              required
              class="input"
              placeholder="e.g. University of Example"
            />
          </div>

          <div>
            <label for="name" class="block text-sm font-medium text-brand-charcoal mb-2">
              Your name
            </label>
            <input
              id="name"
              v-model="formData.name"
              type="text"
              required
              class="input"
              placeholder="Your name"
            />
          </div>

          <div>
            <label for="title" class="block text-sm font-medium text-brand-charcoal mb-2">
              Title / role
            </label>
            <input
              id="title"
              v-model="formData.title"
              type="text"
              required
              class="input"
              placeholder="e.g. Director of Career Services"
            />
          </div>

          <div>
            <label for="email" class="block text-sm font-medium text-brand-charcoal mb-2">
              Work email
            </label>
            <input
              id="email"
              v-model="formData.email"
              type="email"
              required
              class="input"
              placeholder="you@university.edu"
            />
          </div>

          <button type="submit" :disabled="isSubmitting" class="btn-primary w-full">
            <span v-if="isSubmitting">Sending...</span>
            <span v-else>Request campus pricing</span>
          </button>
        </form>
      </section>
    </div>
  </div>
</template>
