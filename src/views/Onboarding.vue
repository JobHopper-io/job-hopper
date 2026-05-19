<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { subscriptionAPI, getProductPrice } from '@/lib/subscription'
import { profileAPI } from '@/lib/profile'
import { freemiumAPI, FREEMIUM_BASE_PLAN_TIER_KEYS, type FreemiumBasePlanTierKey } from '@/lib/freemium'
import { useUserStore } from '@/stores/user'
import type { Product } from '@/types/database'
import { ROLE_CATEGORIES, type RoleCategoryValue } from '@/lib/roleCategories'
import ResumeUploader from '@/components/ResumeUploader.vue'
import PreferredLocationsInput from '@/components/PreferredLocationsInput.vue'
import LocationRadiusInput from '@/components/LocationRadiusInput.vue'

const router = useRouter()
const userStore = useUserStore()
const hasPopulatedFromProfile = ref(false)

// Steps: 1=About, 2=Targets, 3=Resume, 4=Plan
const currentStep = ref(1)
const totalSteps = 4

// Step 1: About You
const firstName = ref('')
const lastName = ref('')
const currentJobTitle = ref('')
const yearsOfExperience = ref<number | null>(null)
const currentIndustry = ref('')
const requiresUsSponsorship = ref<boolean | null>(null)

// Step 2: Targets
const targetJobTitle = ref('')
const targetRoleCategories = ref<RoleCategoryValue[]>([])
const desiredSalaryMin = ref<number | null>(null)
const desiredSalaryMax = ref<number | null>(null)
const preferredLocations = ref<string[]>([])
const locationRadius = ref(25)
const openToRelocation = ref(false)
const openToRemote = ref(false)

// Step 3: Resume Upload
const resumeFile = ref<File | null>(null)

// Step 4: Plan Selection (product ids from DB) or free tier
const basePlanProducts = ref<Product[]>([])
const addonProducts = ref<Product[]>([])
const selectedBasePlanId = ref<string | null>(null)
const selectedAddonIds = ref<string[]>([])
const startFreePlan = ref(false)
const selectedFreemiumTier = ref<FreemiumBasePlanTierKey | ''>('')

const freemiumTierOptions: { value: FreemiumBasePlanTierKey; label: string }[] = [
  { value: 'entry_mid', label: 'Entry & Mid Level' },
  { value: 'senior_management', label: 'Senior & Management' },
  { value: 'director_vp_c_level', label: 'Director, VP & C-Level' },
]

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
  return (
    targetJobTitle.value.trim().length > 0 &&
    targetRoleCategories.value.length > 0 &&
    preferredLocations.value.length > 0
  )
})

const canProceedStep4 = computed(() => {
  if (startFreePlan.value) {
    return FREEMIUM_BASE_PLAN_TIER_KEYS.includes(selectedFreemiumTier.value as FreemiumBasePlanTierKey)
  }
  return selectedBasePlanId.value !== null
})

const canProceedCurrentStep = computed(() => {
  if (currentStep.value === 1) return canProceedStep1.value
  if (currentStep.value === 2) return canProceedStep2.value
  if (currentStep.value === 3) return true
  return true
})

function getFirstIncompleteStep(): number {
  if (!canProceedStep1.value) return 1
  if (!canProceedStep2.value) return 2
  if (!userStore.profile?.resume_bucket_key) return 3
  return 4
}

function populateFromProfile() {
  const p = userStore.profile
  if (!p || hasPopulatedFromProfile.value) return
  hasPopulatedFromProfile.value = true

  firstName.value = p.first_name ?? ''
  lastName.value = p.last_name ?? ''
  currentJobTitle.value = p.current_job_title ?? ''
  yearsOfExperience.value = p.years_of_experience ?? null
  currentIndustry.value = p.current_industry ?? ''

  targetJobTitle.value = p.target_job_title ?? ''
  const validCategories = (p.target_role_categories ?? []).filter(
    (v): v is RoleCategoryValue => ROLE_CATEGORIES.some((r) => r.value === v)
  )
  targetRoleCategories.value = validCategories
  desiredSalaryMin.value = p.desired_salary_min ?? null
  desiredSalaryMax.value = p.desired_salary_max ?? null
  preferredLocations.value = p.preferred_locations ?? []
  openToRelocation.value = p.open_to_relocation ?? false
  openToRemote.value = p.open_to_remote ?? false
  // location_radius_miles is nullable; default to 25 if not set
  if (typeof p.location_radius_miles === 'number' && !Number.isNaN(p.location_radius_miles)) {
    locationRadius.value = p.location_radius_miles
  }

  requiresUsSponsorship.value =
    typeof p.requires_us_sponsorship === 'boolean' ? p.requires_us_sponsorship : null

  currentStep.value = getFirstIncompleteStep()
}

onMounted(async () => {
  const [baseRes, addonRes] = await Promise.all([
    subscriptionAPI.getBasePlanProducts(),
    subscriptionAPI.getAddonProducts()
  ])
  if (baseRes.data) basePlanProducts.value = baseRes.data
  if (addonRes.data) addonProducts.value = addonRes.data
})

watch(
  () => userStore.profile,
  (profile) => {
    if (profile) populateFromProfile()
  },
  { immediate: true }
)

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

const handleResumeFileSelected = (file: File) => {
  resumeFile.value = file
}

function toggleAddon(productId: string, checked: boolean) {
  if (checked) {
    selectedAddonIds.value = [...selectedAddonIds.value, productId]
  } else {
    selectedAddonIds.value = selectedAddonIds.value.filter((id) => id !== productId)
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

function selectPaidPlan(productId: string) {
  startFreePlan.value = false
  selectedFreemiumTier.value = ''
  selectedBasePlanId.value = productId
}

function selectFreePlan() {
  startFreePlan.value = true
  selectedBasePlanId.value = null
  selectedAddonIds.value = []
}

async function persistProfileAndResume(): Promise<boolean> {
  const { error: updateError } = await profileAPI.updateProfile({
    first_name: firstName.value.trim() || undefined,
    last_name: lastName.value.trim() || undefined,
    current_job_title: currentJobTitle.value,
    target_job_title: targetJobTitle.value.trim(),
    years_of_experience: yearsOfExperience.value ?? undefined,
    current_industry: currentIndustry.value,
    target_role_categories: targetRoleCategories.value,
    desired_salary_min: desiredSalaryMin.value ?? undefined,
    desired_salary_max: desiredSalaryMax.value ?? undefined,
    preferred_locations: preferredLocations.value.length > 0 ? preferredLocations.value : undefined,
    open_to_relocation: openToRelocation.value,
    open_to_remote: openToRemote.value,
    location_radius_miles: locationRadius.value ?? undefined,
    requires_us_sponsorship:
      requiresUsSponsorship.value === null ? undefined : requiresUsSponsorship.value,
  })

  if (updateError) {
    console.error('Error updating profile:', updateError)
    error.value = 'We couldn’t save your profile details. Please try again before continuing.'
    return false
  }

  if (resumeFile.value) {
    const { error: resumeUploadError } = await profileAPI.uploadResume(resumeFile.value)
    if (resumeUploadError) {
      console.error('Error uploading resume:', resumeUploadError)
      error.value = resumeUploadError.message || 'Could not upload your resume. Please try again.'
      return false
    }
  }
  return true
}

// Note: Authentication and onboarding redirects are handled in router guard

const handleContinueForFree = async () => {
  try {
    isLoading.value = true
    error.value = ''
    if (!FREEMIUM_BASE_PLAN_TIER_KEYS.includes(selectedFreemiumTier.value as FreemiumBasePlanTierKey)) {
      error.value = 'Please choose which plan level best describes the roles you want.'
      return
    }
    const ok = await persistProfileAndResume()
    if (!ok) return

    const { error: freeError } = await freemiumAPI.completeOnboarding(selectedFreemiumTier.value)
    if (freeError) {
      error.value = freeError.message || 'Could not finish free signup. Please try again.'
      return
    }
    await userStore.refreshProfile()
    await router.push('/dashboard')
  } catch (err) {
    error.value = (err as Error).message || 'An unexpected error occurred'
    console.error('Onboarding error:', err)
  } finally {
    isLoading.value = false
  }
}

const handleProceedToCheckout = async () => {
  try {
    isLoading.value = true
    error.value = ''

    const ok = await persistProfileAndResume()
    if (!ok) return

    if (!selectedBasePlanId.value) {
      error.value = 'Please select a plan to continue.'
      return
    }

    const successUrl = `${window.location.origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${window.location.origin}/onboarding`
    const productIds = [selectedBasePlanId.value, ...selectedAddonIds.value]

    const { data, error: checkoutError } = await subscriptionAPI.createCheckoutSession(
      productIds,
      successUrl,
      cancelUrl
    )

    if (checkoutError) {
      error.value = 'Unable to start checkout. Please try again.'
      console.error('Checkout session error:', checkoutError)
      return
    }

    if (data?.url) {
      window.location.href = data.url
    } else {
      error.value = 'Unable to start checkout. Please try again.'
    }
  } catch (err) {
    error.value = (err as Error).message || 'An unexpected error occurred'
    console.error('Onboarding error:', err)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
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
                placeholder="e.g., Technology, Healthcare, Manufacturing"
              />
            </div>

            <div>
              <p class="block text-sm font-medium text-brand-charcoal mb-2">
                Do you require sponsorship to work in the United States?
              </p>
              <div class="flex flex-col sm:flex-row gap-3">
                <label class="inline-flex items-center gap-2">
                  <input
                    v-model="requiresUsSponsorship"
                    type="radio"
                    :value="true"
                    class="w-4 h-4"
                  />
                  <span class="text-sm text-neutral-body">Yes, I require sponsorship</span>
                </label>
                <label class="inline-flex items-center gap-2">
                  <input
                    v-model="requiresUsSponsorship"
                    type="radio"
                    :value="false"
                    class="w-4 h-4"
                  />
                  <span class="text-sm text-neutral-body">No, I do not require sponsorship</span>
                </label>
              </div>
              <p class="mt-2 text-sm text-neutral-body">
                If you select yes, Job-Hopper can surface a sponsorship-likelihood signal on postings (from metadata analysis in the Hopper). It helps you focus your time—it does not guarantee an employer will sponsor.
              </p>
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
              <label for="targetJobTitle" class="block text-sm font-medium text-brand-charcoal mb-2">Target job title</label>
              <input
                id="targetJobTitle"
                v-model="targetJobTitle"
                type="text"
                required
                class="input"
                placeholder="e.g., Maintenance Supervisor"
              />
            </div>
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

            <div class="space-y-3">
              <PreferredLocationsInput
                v-model="preferredLocations"
                label="Location preferences"
                input-id="preferredLocations"
              />
              <LocationRadiusInput v-model="locationRadius" label="Location radius" />
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

          <ResumeUploader
            :resume-bucket-key="userStore.profile?.resume_bucket_key ?? null"
            :auto-upload="false"
            input-id="onboarding-resume-upload"
            @file-selected="handleResumeFileSelected"
          />
        </div>

        <!-- Step 4: Plan Selection -->
        <div v-if="currentStep === 4">
          <h2 class="text-2xl font-heading font-bold text-brand-charcoal mb-2">
            Choose how you want to start
          </h2>
          <p class="text-neutral-body mb-6">
            Subscribe with a 7-day free trial for automated matching and email digests, or start on the free plan and run job searches yourself when you are ready. You can upgrade anytime from billing.
          </p>

          <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                :class="[
                  'card p-6 text-left transition-all flex flex-col',
                  startFreePlan ? 'border-2 border-brand-primary bg-brand-primary/5' : ''
                ]"
              >
                <h3 class="font-semibold mb-2">Start for free</h3>
                <p class="text-2xl font-bold text-brand-primary mb-1">$0</p>
                <p class="text-sm text-neutral-body mb-4 grow">
                  Explore the dashboard and preview our features.
                </p>
                <button type="button" class="btn-secondary w-full mb-3" @click="selectFreePlan">
                  Choose free
                </button>
                <div v-if="startFreePlan">
                  <label for="freemium-tier" class="block text-sm font-medium text-brand-charcoal mb-1">
                    Which level of roles are you targeting? <span class="text-red-600">*</span>
                  </label>
                  <select
                    id="freemium-tier"
                    v-model="selectedFreemiumTier"
                    class="input w-full"
                  >
                    <option disabled value="">Select a category</option>
                    <option
                      v-for="opt in freemiumTierOptions"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                </div>
              </div>

              <div
                v-for="product in basePlanProducts"
                :key="product.id"
                :class="[
                  'card p-6 text-left transition-all',
                  !startFreePlan && selectedBasePlanId === product.id ? 'border-2 border-brand-primary bg-brand-primary/5' : ''
                ]"
              >
                <h3 class="font-semibold mb-2">{{ product.display_name }}</h3>
                <p class="text-2xl font-bold text-brand-primary mb-1">${{ getProductPrice(product) }}<span class="text-sm font-normal text-neutral-body">/month</span></p>
                <p class="text-sm text-neutral-body mb-4">{{ product.description || '' }}</p>
                <button
                  type="button"
                  @click="selectPaidPlan(product.id)"
                  class="btn-primary w-full"
                >
                  Select plan
                </button>
              </div>
            </div>

            <div v-if="!startFreePlan" class="border-t border-neutral-border pt-6">
              <h3 class="font-semibold text-brand-charcoal mb-2">Optional add-ons</h3>
              <p class="text-sm text-neutral-body mb-4">Separately priced; add any you'd like.</p>
              <div class="space-y-3">
                <label
                  v-for="product in addonProducts"
                  :key="product.id"
                  class="flex items-start"
                >
                  <input
                    :checked="selectedAddonIds.includes(product.id)"
                    type="checkbox"
                    class="mr-3 mt-1 w-4 h-4"
                    @change="(e) => toggleAddon(product.id, (e.target as HTMLInputElement).checked)"
                  />
                  <div>
                    <span class="font-medium text-brand-charcoal">{{ product.display_name }}</span>
                    <span class="text-sm text-neutral-body block">
                      {{
                        product.category === 'one_time_addon' || product.category === 'one_time_item'
                          ? `$${getProductPrice(product).toFixed(2)} one-time`
                          : `+$${getProductPrice(product)}/month`
                      }}
                      — {{ product.description || '' }}
                    </span>
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
            {{ currentStep === 3 && !resumeFile && !userStore.profile?.resume_bucket_key ? 'Skip for now' : 'Continue' }}
          </button>
          <button
            v-else-if="startFreePlan"
            @click="handleContinueForFree"
            type="button"
            :disabled="!canProceedStep4 || isLoading"
            class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading">Saving…</span>
            <span v-else>Continue for free</span>
          </button>
          <button
            v-else
            @click="handleProceedToCheckout"
            type="button"
            :disabled="!canProceedStep4 || isLoading"
            class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading">Redirecting to checkout...</span>
            <span v-else>Proceed to checkout</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
