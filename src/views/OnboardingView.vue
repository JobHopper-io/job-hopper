<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { subscriptionAPI, profileAPI } from '@/lib/supabase'
import { getTierDisplayName, getTierPrice, type SubscriptionTier } from '@/lib/subscription'
import { ROLE_CATEGORIES, type RoleCategoryValue } from '@/lib/roleCategories'

const router = useRouter()

// Steps: 1=About, 2=Targets, 3=Resume, 4=Plan
const currentStep = ref(1)
const totalSteps = 4

// Step 1: About You
const firstName = ref('')
const lastName = ref('')
const currentJobTitle = ref('')
const yearsOfExperience = ref<number | null>(null)
const currentIndustry = ref('')

// Step 2: Targets
const targetRoleCategories = ref<RoleCategoryValue[]>([])
const desiredSalaryMin = ref<number | null>(null)
const desiredSalaryMax = ref<number | null>(null)
const preferredLocation = ref('')
const locationRadius = ref(25)
const openToRelocation = ref(false)
const openToRemote = ref(false)

// Step 3: Resume Upload
const resumeFile = ref<File | null>(null)
const resumeFileName = ref('')

// Step 4: Plan Selection
const selectedTier = ref<SubscriptionTier | null>(null)
const premiumInsights = ref(false)
const interviewPrep = ref(false)
const resumeUpgrade = ref(false)

const isLoading = ref(false)
const error = ref('')

const canProceedStep1 = computed(() => {
  const hasYears = yearsOfExperience.value !== null && yearsOfExperience.value >= 0
  return (
    firstName.value.trim() &&
    lastName.value.trim() &&
    currentJobTitle.value &&
    hasYears &&
    currentIndustry.value
  )
})

const canProceedStep2 = computed(() => {
  return targetRoleCategories.value.length > 0 && preferredLocation.value
})

const canProceedStep4 = computed(() => {
  return selectedTier.value !== null
})

const canProceedCurrentStep = computed(() => {
  if (currentStep.value === 1) return canProceedStep1.value
  if (currentStep.value === 2) return canProceedStep2.value
  if (currentStep.value === 3) return true
  return true
})

const YEARS_MIN = 0
const YEARS_MAX = 50
const YEARS_MAX_DIGITS = 2

function handleYearsInput(e: Event) {
  const input = e.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '').slice(0, YEARS_MAX_DIGITS)
  if (!digits) {
    yearsOfExperience.value = null
    input.value = ''
    return
  }
  const num = parseInt(digits, 10)
  const clamped = Math.min(YEARS_MAX, Math.max(YEARS_MIN, num))
  yearsOfExperience.value = clamped
  input.value = String(clamped)
}

const handleResumeUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    resumeFile.value = target.files[0]
    resumeFileName.value = target.files[0].name
  }
}

const nextStep = () => {
  if (currentStep.value < totalSteps) {
    currentStep.value++
  }
}

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

const toggleRoleCategory = (value: RoleCategoryValue) => {
  const index = targetRoleCategories.value.indexOf(value)
  if (index > -1) {
    targetRoleCategories.value.splice(index, 1)
  } else {
    targetRoleCategories.value.push(value)
  }
}

// Note: Authentication and onboarding redirects are handled in router guard

const handleCompleteOnboarding = async () => {
  try {
    isLoading.value = true
    error.value = ''

    const profileError = await profileAPI.updateProfile({
      first_name: firstName.value.trim() || undefined,
      last_name: lastName.value.trim() || undefined,
      current_job_title: currentJobTitle.value,
      years_of_experience: yearsOfExperience.value ?? undefined,
      current_industry: currentIndustry.value,
      target_role_categories: targetRoleCategories.value,
      desired_salary_min: desiredSalaryMin.value ?? undefined,
      desired_salary_max: desiredSalaryMax.value || undefined,
      preferred_locations: preferredLocation.value ? [preferredLocation.value] : undefined,
      open_to_relocation: openToRelocation.value,
      open_to_remote: openToRemote.value
    })

    if (profileError.error) {
      console.error('Error updating profile:', profileError.error)
    }

    if (resumeFile.value) {
      try {
        await profileAPI.uploadResume(resumeFile.value)
      } catch (resumeError) {
        console.error('Error uploading resume:', resumeError)
      }
    }

    if (selectedTier.value) {
      try {
        await subscriptionAPI.createSubscription(selectedTier.value, 7)
        if (premiumInsights.value) {
          await subscriptionAPI.enableAddon('premium_insights')
        }
        if (interviewPrep.value) {
          await subscriptionAPI.enableAddon('interview_prep')
        }
        if (resumeUpgrade.value) {
          await subscriptionAPI.enableAddon('resume_upgrade')
        }
      } catch (subError) {
        console.error('Error creating subscription:', subError)
        error.value = 'Account created but subscription setup failed. Please contact support.'
        return
      }
    }

    try {
      await profileAPI.markOnboardingComplete()
    } catch (onboardError) {
      console.error('Error marking onboarding complete:', onboardError)
    }

    router.push('/dashboard')
  } catch (err) {
    error.value = (err as Error).message || 'An unexpected error occurred'
    console.error('Onboarding error:', err)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto">
      <div class="mb-8">
        <div class="flex justify-between mb-2">
          <span class="text-sm font-medium text-neutral-body">Step {{ currentStep }} of {{ totalSteps }}</span>
          <span class="text-sm text-neutral-body">{{ Math.round((currentStep / totalSteps) * 100) }}%</span>
        </div>
        <div class="w-full bg-neutral-border rounded-full h-2">
          <div
            class="bg-brand-primary h-2 rounded-full transition-all duration-300"
            :style="{ width: `${(currentStep / totalSteps) * 100}%` }"
          ></div>
        </div>
      </div>

      <div class="card p-8">
        <!-- Step 1: About You -->
        <div v-if="currentStep === 1">
          <h2 class="text-2xl font-heading font-bold text-brand-charcoal mb-6">
            Welcome — we're glad you're here.
          </h2>
          <h3 class="text-lg font-heading font-semibold text-brand-charcoal mb-2">
            Tell us about your current role
          </h3>
          <p class="text-neutral-body mb-6">
            This helps us understand where you're starting from so we can match you more accurately.
          </p>
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="firstName" class="block text-sm font-medium text-brand-charcoal mb-2">First name</label>
                <input
                  id="firstName"
                  v-model="firstName"
                  type="text"
                  required
                  class="input"
                  placeholder="First name"
                />
              </div>
              <div>
                <label for="lastName" class="block text-sm font-medium text-brand-charcoal mb-2">Last name</label>
                <input
                  id="lastName"
                  v-model="lastName"
                  type="text"
                  required
                  class="input"
                  placeholder="Last name"
                />
              </div>
            </div>
            <div>
              <label for="currentJobTitle" class="block text-sm font-medium text-brand-charcoal mb-2">Current job title</label>
              <input
                id="currentJobTitle"
                v-model="currentJobTitle"
                type="text"
                required
                class="input"
                placeholder="e.g., Maintenance Technician"
              />
            </div>

            <div>
              <label for="yearsOfExperience" class="block text-sm font-medium text-brand-charcoal mb-2">Years of experience</label>
              <input
                id="yearsOfExperience"
                :value="yearsOfExperience ?? ''"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="2"
                required
                class="input"
                placeholder="0"
                @input="handleYearsInput"
              />
            </div>

            <div>
              <label for="currentIndustry" class="block text-sm font-medium text-brand-charcoal mb-2">Current industry or environment</label>
              <input
                id="currentIndustry"
                v-model="currentIndustry"
                type="text"
                required
                class="input"
                placeholder="e.g., Manufacturing, Food Production"
              />
            </div>
          </div>
        </div>

        <!-- Step 2: Targets -->
        <div v-if="currentStep === 2">
          <h2 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
            What kind of roles are you targeting?
          </h2>
          <p class="text-neutral-body mb-6">
            You can fine-tune these later. For now, a rough target is enough to get started.
          </p>

          <div class="space-y-6">
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-3">Role categories (select all that apply)</label>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  v-for="opt in ROLE_CATEGORIES"
                  :key="opt.value"
                  type="button"
                  @click="toggleRoleCategory(opt.value)"
                  :class="[
                    'p-3 rounded-[12px] border-2 text-left transition-colors',
                    targetRoleCategories.includes(opt.value)
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                      : 'border-neutral-border hover:border-brand-primary/50'
                  ]"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-2">Desired wage or salary range</label>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <input
                    v-model.number="desiredSalaryMin"
                    type="number"
                    min="0"
                    class="input"
                    placeholder="Min ($)"
                  />
                </div>
                <div>
                  <input
                    v-model.number="desiredSalaryMax"
                    type="number"
                    min="0"
                    class="input"
                    placeholder="Max ($)"
                  />
                </div>
              </div>
            </div>

            <div>
              <label for="preferredLocation" class="block text-sm font-medium text-brand-charcoal mb-2">Location preferences</label>
              <input
                id="preferredLocation"
                v-model="preferredLocation"
                type="text"
                required
                class="input mb-2"
                placeholder="City, State, or ZIP"
              />
              <div class="flex items-center gap-4 mt-2">
                <label class="flex items-center">
                  <input
                    v-model.number="locationRadius"
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    class="mr-2"
                  />
                  <span class="text-sm text-neutral-body">Within {{ locationRadius }} miles</span>
                </label>
              </div>
            </div>

            <div class="space-y-3">
              <label class="flex items-center">
                <input
                  v-model="openToRelocation"
                  type="checkbox"
                  class="mr-3 w-4 h-4"
                />
                <span class="text-sm text-neutral-body">Open to relocation</span>
              </label>
              <label class="flex items-center">
                <input
                  v-model="openToRemote"
                  type="checkbox"
                  class="mr-3 w-4 h-4"
                />
                <span class="text-sm text-neutral-body">Open to remote roles</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Step 3: Resume Upload -->
        <div v-if="currentStep === 3">
          <h2 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
            Upload your resume (optional, but recommended)
          </h2>
          <p class="text-neutral-body font-medium mb-2">
            We use this only to improve your matches—never to sell your data.
          </p>
          <p class="text-neutral-body mb-6">
            A resume gives our matching engine more context: your skills, equipment or systems you've worked with, and the progression of your career. You can skip this step and come back later if you'd like.
          </p>

          <div class="space-y-4">
            <div class="space-y-2">
              <label class="block text-sm font-medium text-brand-charcoal">Resume file</label>
              <input
                id="resume-upload"
                type="file"
                accept=".pdf,.doc,.docx"
                class="hidden"
                @change="handleResumeUpload"
              />
              <label for="resume-upload" class="btn-secondary cursor-pointer inline-block">
                Upload resume
              </label>
              <p v-if="resumeFileName" class="text-sm text-neutral-body mt-2">
                Selected: {{ resumeFileName }}
              </p>
            </div>
          </div>
        </div>

        <!-- Step 4: Plan Selection -->
        <div v-if="currentStep === 4">
          <h2 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
            Choose your plan and start your 7-day free trial
          </h2>
          <p class="text-neutral-body mb-6">
            Pick the plan that matches the level of roles you're targeting. You won't be charged today. If you stay after your 7-day trial, billing begins automatically at the monthly rate for your chosen plan. You can change plans or cancel anytime.
          </p>

          <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                :class="[
                  'card p-6 text-left transition-all',
                  selectedTier === 'entry_mid' ? 'border-2 border-brand-primary bg-brand-primary/5' : ''
                ]"
              >
                <h3 class="font-semibold mb-2">{{ getTierDisplayName('entry_mid') }}</h3>
                <p class="text-2xl font-bold text-brand-primary mb-1">${{ getTierPrice('entry_mid') }}<span class="text-sm font-normal text-neutral-body">/month</span></p>
                <p class="text-sm text-neutral-body mb-4">For hourly, administrative, and early-career roles</p>
                <button
                  type="button"
                  @click="selectedTier = 'entry_mid'"
                  class="btn-primary w-full"
                >
                  Select plan
                </button>
              </div>

              <div
                :class="[
                  'card p-6 text-left transition-all',
                  selectedTier === 'senior_management' ? 'border-2 border-brand-primary bg-brand-primary/5' : ''
                ]"
              >
                <h3 class="font-semibold mb-2">{{ getTierDisplayName('senior_management') }}</h3>
                <p class="text-2xl font-bold text-brand-primary mb-1">${{ getTierPrice('senior_management') }}<span class="text-sm font-normal text-neutral-body">/month</span></p>
                <p class="text-sm text-neutral-body mb-4">For experienced professionals and managers</p>
                <button
                  type="button"
                  @click="selectedTier = 'senior_management'"
                  class="btn-primary w-full"
                >
                  Select plan
                </button>
              </div>

              <div
                :class="[
                  'card p-6 text-left transition-all',
                  selectedTier === 'director_vp_c_level' ? 'border-2 border-brand-primary bg-brand-primary/5' : ''
                ]"
              >
                <h3 class="font-semibold mb-2">{{ getTierDisplayName('director_vp_c_level') }}</h3>
                <p class="text-2xl font-bold text-brand-primary mb-1">${{ getTierPrice('director_vp_c_level') }}<span class="text-sm font-normal text-neutral-body">/month</span></p>
                <p class="text-sm text-neutral-body mb-4">For executives and senior leaders</p>
                <button
                  type="button"
                  @click="selectedTier = 'director_vp_c_level'"
                  class="btn-primary w-full"
                >
                  Select plan
                </button>
              </div>
            </div>

            <div class="border-t border-neutral-border pt-6">
              <h3 class="font-semibold text-brand-charcoal mb-2">Optional add-ons</h3>
              <p class="text-sm text-neutral-body mb-4">Separately priced; add any you'd like.</p>
              <div class="space-y-3">
                <label class="flex items-start">
                  <input
                    v-model="premiumInsights"
                    type="checkbox"
                    class="mr-3 mt-1 w-4 h-4"
                  />
                  <div>
                    <span class="font-medium text-brand-charcoal">Premium Insights & Contact Access</span>
                    <span class="text-sm text-neutral-body block">+$30/month — Hiring contact details and outreach messages</span>
                  </div>
                </label>
                <label class="flex items-start">
                  <input
                    v-model="interviewPrep"
                    type="checkbox"
                    class="mr-3 mt-1 w-4 h-4"
                  />
                  <div>
                    <span class="font-medium text-brand-charcoal">Interview Prep & Strategy</span>
                    <span class="text-sm text-neutral-body block">+$30/month — Role-specific talking points and interview guidance</span>
                  </div>
                </label>
                <label class="flex items-start">
                  <input
                    v-model="resumeUpgrade"
                    type="checkbox"
                    class="mr-3 mt-1 w-4 h-4"
                  />
                  <div>
                    <span class="font-medium text-brand-charcoal">Resume Upgrade</span>
                    <span class="text-sm text-neutral-body block">$19.95 one-time — Professional resume refresh</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div v-if="error" class="mt-6 p-4 bg-red-50 border border-red-200 rounded-[12px]">
          <p class="text-red-800 text-sm">{{ error }}</p>
        </div>

        <div class="mt-8 flex justify-between">
          <button
            v-if="currentStep > 1"
            @click="prevStep"
            type="button"
            class="btn-secondary"
          >
            Back
          </button>
          <div v-else></div>

          <button
            v-if="currentStep < totalSteps"
            @click="nextStep"
            type="button"
            :disabled="!canProceedCurrentStep"
            class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ currentStep === 3 && !resumeFile ? 'Skip for now' : 'Continue' }}
          </button>
          <button
            v-else
            @click="handleCompleteOnboarding"
            type="button"
            :disabled="!canProceedStep4 || isLoading"
            class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading">Starting trial...</span>
            <span v-else>Start my free trial</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
