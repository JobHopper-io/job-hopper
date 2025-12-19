<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI, subscriptionAPI, profileAPI } from '@/lib/supabase'

const router = useRouter()

// Step tracking
const currentStep = ref(1)
const totalSteps = 5

// Step 1: Account Creation
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)

// Step 2: About You
const firstName = ref('')
const lastName = ref('')
const currentJobTitle = ref('')
const yearsOfExperience = ref<number | null>(null)
const currentIndustry = ref('')

// Step 3: Targets
const targetRoleCategories = ref<string[]>([])
const desiredSalaryMin = ref<number | null>(null)
const desiredSalaryMax = ref<number | null>(null)
const preferredLocation = ref('')
const locationRadius = ref(25)
const openToRelocation = ref(false)
const openToRemote = ref(false)

const roleCategoryOptions = [
  'Operations / Production',
  'Maintenance / Technical',
  'Engineering',
  'Supervisory / Management',
  'Director / VP / Executive',
  'Other'
]

// Step 4: Resume Upload
const resumeFile = ref<File | null>(null)
const resumeFileName = ref('')
const skipResume = ref(false)

// Step 5: Plan Selection
const selectedTier = ref<'entry_mid' | 'senior_management' | 'director_vp_c_level' | null>(null)
const premiumInsights = ref(false)
const interviewPrep = ref(false)
const resumeUpgrade = ref(false)

// General state
const isLoading = ref(false)
const error = ref('')

// Validation
const validatePassword = (password: string) => {
  const minLength = 8
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters long`
  }
  return null
}

const canProceedStep1 = computed(() => {
  return email.value && password.value && confirmPassword.value && password.value === confirmPassword.value
})

const canProceedStep2 = computed(() => {
  return firstName.value && lastName.value && currentJobTitle.value && yearsOfExperience.value !== null && currentIndustry.value
})

const canProceedStep3 = computed(() => {
  return targetRoleCategories.value.length > 0 && preferredLocation.value
})

const canProceedStep5 = computed(() => {
  return selectedTier.value !== null
})

// File handling
const handleResumeUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    resumeFile.value = target.files[0]
    resumeFileName.value = target.files[0].name
  }
}

// Navigation
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

const toggleRoleCategory = (category: string) => {
  const index = targetRoleCategories.value.indexOf(category)
  if (index > -1) {
    targetRoleCategories.value.splice(index, 1)
  } else {
    targetRoleCategories.value.push(category)
  }
}

// Final submission
const handleCompleteOnboarding = async () => {
  try {
    isLoading.value = true
    error.value = ''

    // Step 1: Create account
    const { data: signUpData, error: signUpError } = await authAPI.signUp(
      email.value,
      password.value,
      firstName.value,
      lastName.value,
      undefined, // phoneNumber
      `${window.location.origin}/dashboard`
    )

    if (signUpError) {
      error.value = signUpError.message
      return
    }

    // Check if email confirmation is required
    // If session is null but user exists, email confirmation is required
    if (!signUpData.session && signUpData.user) {
      // Email confirmation required - user profile will be created via trigger
      // Show success message and redirect to login
      error.value = ''
      alert('Account created! Please check your email to confirm your account. After confirmation, you can log in and complete your profile setup.')
      router.push('/login')
      return
    }

    // If no user at all, something went wrong
    if (!signUpData.user) {
      error.value = 'Account creation failed. Please try again.'
      return
    }

    // User is authenticated (email confirmation disabled or already confirmed)
    // Wait a moment for user profile to be created
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Step 2 & 3: Update profile
    const profileError = await profileAPI.updateProfile({
      current_job_title: currentJobTitle.value,
      years_of_experience: yearsOfExperience.value || undefined,
      current_industry: currentIndustry.value,
      target_role_categories: targetRoleCategories.value,
      desired_salary_min: desiredSalaryMin.value || undefined,
      desired_salary_max: desiredSalaryMax.value || undefined,
      preferred_locations: preferredLocation.value ? [preferredLocation.value] : undefined,
      open_to_relocation: openToRelocation.value,
      open_to_remote: openToRemote.value
    })

    if (profileError.error) {
      console.error('Error updating profile:', profileError.error)
      // Continue anyway - profile can be updated later
    }

    // Step 4: Upload resume if provided
    if (!skipResume.value && resumeFile.value) {
      try {
        await profileAPI.uploadResume(resumeFile.value)
      } catch (resumeError) {
        console.error('Error uploading resume:', resumeError)
        // Continue anyway - resume can be uploaded later
      }
    }

    // Step 5: Create subscription
    if (selectedTier.value) {
      try {
        await subscriptionAPI.createSubscription(selectedTier.value, 7)

        // Enable add-ons
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

    // Mark onboarding complete
    try {
      await profileAPI.markOnboardingComplete()
    } catch (onboardError) {
      console.error('Error marking onboarding complete:', onboardError)
      // Continue anyway
    }

    // Redirect to dashboard
    router.push('/dashboard')
  } catch (err: any) {
    error.value = err.message || 'An unexpected error occurred'
    console.error('Onboarding error:', err)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto">
      <!-- Progress Bar -->
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

      <!-- Step Content -->
      <div class="card p-8">
        <!-- Step 1: Account Creation -->
        <div v-if="currentStep === 1">
          <h2 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
            Create your Job-Hopper account
          </h2>
          <p class="text-neutral-body mb-6">
            You'll be done in under a minute.
          </p>

          <div class="space-y-4">
            <div>
              <label for="email" class="block text-sm font-medium text-brand-charcoal mb-2">Email</label>
              <input
                id="email"
                v-model="email"
                type="email"
                required
                class="input"
                placeholder="your.email@example.com"
              />
            </div>

            <div>
              <label for="password" class="block text-sm font-medium text-brand-charcoal mb-2">Password</label>
              <div class="relative">
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  class="input pr-10"
                  placeholder="Password (min 8 characters)"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg v-if="showPassword" class="h-5 w-5 text-neutral-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
                  </svg>
                  <svg v-else class="h-5 w-5 text-neutral-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label for="confirmPassword" class="block text-sm font-medium text-brand-charcoal mb-2">Confirm Password</label>
              <div class="relative">
                <input
                  id="confirmPassword"
                  v-model="confirmPassword"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  required
                  class="input pr-10"
                  placeholder="Confirm password"
                />
                <button
                  type="button"
                  @click="showConfirmPassword = !showConfirmPassword"
                  class="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg v-if="showConfirmPassword" class="h-5 w-5 text-neutral-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
                  </svg>
                  <svg v-else class="h-5 w-5 text-neutral-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                  </svg>
                </button>
              </div>
            </div>

            <div v-if="password && confirmPassword && password !== confirmPassword" class="text-red-600 text-sm">
              Passwords do not match
            </div>
          </div>
        </div>

        <!-- Step 2: About You -->
        <div v-if="currentStep === 2">
          <h2 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
            Tell us about your current role
          </h2>
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
                v-model.number="yearsOfExperience"
                type="number"
                min="0"
                max="50"
                required
                class="input"
                placeholder="0"
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

        <!-- Step 3: Targets -->
        <div v-if="currentStep === 3">
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
                  v-for="category in roleCategoryOptions"
                  :key="category"
                  type="button"
                  @click="toggleRoleCategory(category)"
                  :class="[
                    'p-3 rounded-[12px] border-2 text-left transition-colors',
                    targetRoleCategories.includes(category)
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                      : 'border-neutral-border hover:border-brand-primary/50'
                  ]"
                >
                  {{ category }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-2">Desired salary range</label>
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
              <label for="preferredLocation" class="block text-sm font-medium text-brand-charcoal mb-2">Preferred location</label>
              <input
                id="preferredLocation"
                v-model="preferredLocation"
                type="text"
                required
                class="input mb-2"
                placeholder="City, State or ZIP"
              />
              <div class="flex items-center gap-4">
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

        <!-- Step 4: Resume Upload -->
        <div v-if="currentStep === 4">
          <h2 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
            Upload your resume (optional, but recommended)
          </h2>
          <p class="text-neutral-body mb-4">
            We use this only to improve your matches—never to sell your data.
          </p>
          <p class="text-neutral-body mb-6">
            A resume gives our matching engine more context: your skills, equipment or systems you've worked with, and the progression of your career. You can skip this step and come back later if you'd like.
          </p>

          <div class="space-y-4">
            <div v-if="!skipResume">
              <label class="block text-sm font-medium text-brand-charcoal mb-2">Resume file</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                @change="handleResumeUpload"
                class="input"
              />
              <p v-if="resumeFileName" class="text-sm text-neutral-body mt-2">
                Selected: {{ resumeFileName }}
              </p>
            </div>

            <button
              type="button"
              @click="skipResume = !skipResume"
              class="text-brand-primary hover:underline text-sm"
            >
              {{ skipResume ? 'Upload resume instead' : 'Skip for now' }}
            </button>
          </div>
        </div>

        <!-- Step 5: Plan Selection -->
        <div v-if="currentStep === 5">
          <h2 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
            Choose your plan and start your 7-day free trial
          </h2>
          <p class="text-neutral-body mb-6">
            Pick the plan that matches the level of roles you're targeting. You won't be charged today. If you stay after your 7-day trial, billing begins automatically at the monthly rate for your chosen plan. You can change plans or cancel anytime.
          </p>

          <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                @click="selectedTier = 'entry_mid'"
                :class="[
                  'card p-6 text-left transition-all',
                  selectedTier === 'entry_mid' ? 'border-2 border-brand-primary bg-brand-primary/5' : ''
                ]"
              >
                <h3 class="font-semibold mb-2">Entry & Mid Level</h3>
                <p class="text-2xl font-bold text-brand-primary mb-1">$19<span class="text-sm font-normal text-neutral-body">/month</span></p>
                <p class="text-sm text-neutral-body">For hourly, administrative, and early-career roles</p>
              </button>

              <button
                type="button"
                @click="selectedTier = 'senior_management'"
                :class="[
                  'card p-6 text-left transition-all',
                  selectedTier === 'senior_management' ? 'border-2 border-brand-primary bg-brand-primary/5' : ''
                ]"
              >
                <h3 class="font-semibold mb-2">Senior & Management</h3>
                <p class="text-2xl font-bold text-brand-primary mb-1">$29<span class="text-sm font-normal text-neutral-body">/month</span></p>
                <p class="text-sm text-neutral-body">For experienced professionals and managers</p>
              </button>

              <button
                type="button"
                @click="selectedTier = 'director_vp_c_level'"
                :class="[
                  'card p-6 text-left transition-all',
                  selectedTier === 'director_vp_c_level' ? 'border-2 border-brand-primary bg-brand-primary/5' : ''
                ]"
              >
                <h3 class="font-semibold mb-2">Director, VP & C-Level</h3>
                <p class="text-2xl font-bold text-brand-primary mb-1">$49<span class="text-sm font-normal text-neutral-body">/month</span></p>
                <p class="text-sm text-neutral-body">For executives and senior leaders</p>
              </button>
            </div>

            <div class="border-t border-neutral-border pt-6">
              <h3 class="font-semibold text-brand-charcoal mb-4">Optional add-ons</h3>
              <div class="space-y-3">
                <label class="flex items-start">
                  <input
                    v-model="premiumInsights"
                    type="checkbox"
                    class="mr-3 mt-1 w-4 h-4"
                  />
                  <div>
                    <span class="font-medium text-brand-charcoal">Premium Insights & Contact Access</span>
                    <span class="text-sm text-neutral-body block">+$30/month - Hiring contact details and outreach messages</span>
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
                    <span class="text-sm text-neutral-body block">+$30/month - Role-specific talking points and interview guidance</span>
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
                    <span class="text-sm text-neutral-body block">$19.95 one-time - Professional resume refresh</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="mt-6 p-4 bg-red-50 border border-red-200 rounded-[12px]">
          <p class="text-red-800 text-sm">{{ error }}</p>
        </div>

        <!-- Navigation Buttons -->
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
            :disabled="
              (currentStep === 1 && !canProceedStep1) ||
              (currentStep === 2 && !canProceedStep2) ||
              (currentStep === 3 && !canProceedStep3)
            "
            class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
          <button
            v-else
            @click="handleCompleteOnboarding"
            type="button"
            :disabled="!canProceedStep5 || isLoading"
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
