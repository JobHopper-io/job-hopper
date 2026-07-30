<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { subscriptionAPI, getProductPrice } from '@/lib/subscription'
import { profileAPI } from '@/lib/profile'
import { freemiumAPI, FREEMIUM_BASE_PLAN_TIER_KEYS, CAREER_LEVEL_OPTIONS, type FreemiumBasePlanTierKey } from '@/lib/freemium'
import { useUserStore } from '@/stores/user'
import type { Product } from '@/types/database'
import { ROLE_CATEGORIES, type RoleCategoryValue } from '@/lib/roleCategories'
import ResumeUploader from '@/components/ResumeUploader.vue'
import PreferredLocationsInput from '@/components/PreferredLocationsInput.vue'
import LocationRadiusInput from '@/components/LocationRadiusInput.vue'
import TagInput from '@/components/TagInput.vue'
import FormField from '@/components/auth/FormField.vue'
import OnboardingStepHeader from '@/components/onboarding/OnboardingStepHeader.vue'
import OnboardingChip from '@/components/onboarding/OnboardingChip.vue'
import CoreFreeMonthBadge from '@/components/CoreFreeMonthBadge.vue'
import jobHopperLogo from '@/assets/job-hopper-logo.png'
import jobHopperRabbitLogo from '@/assets/job-hopper-rabbit.png'
import { splitTagsField, joinTagsField } from '@/lib/tags'

const router = useRouter()
const userStore = useUserStore()
const hasPopulatedFromProfile = ref(false)

// Steps: 1=About, 2=Role & Level, 3=Compensation & Location, 4=Resume, 5=Plan
const currentStep = ref(1)
const totalSteps = 5
const STEP_NAMES = ['About You', 'Role & Level', 'Compensation', 'Resume', 'Plan']
const STEP_ICONS: [string, string][] = [
  ['fas', 'user'],
  ['fas', 'briefcase'],
  ['fas', 'sack-dollar'],
  ['fas', 'file-lines'],
  ['fas', 'star'],
]

// Step 1: About You
const firstName = ref('')
const lastName = ref('')
const currentJobTitle = ref('')
const currentIndustry = ref('')
const requiresUsSponsorship = ref<boolean | null>(null)

// Step 2: Role & Level
const targetJobTitles = ref<string[]>([])
const targetRoleCategories = ref<RoleCategoryValue[]>([])

// Step 3: Compensation & Location
const desiredSalaryMin = ref<number | null>(null)
const desiredSalaryMax = ref<number | null>(null)
const preferredLocations = ref<string[]>([])
const locationRadius = ref(25)
const openToRelocation = ref(false)
const openToRemote = ref(false)

// Step 4: Resume Upload
const resumeFile = ref<File | null>(null)

// Step 5: Plan Selection (product ids from DB) or free tier
const basePlanProducts = ref<Product[]>([])
const addonProducts = ref<Product[]>([])
const selectedBasePlanId = ref<string | null>(null)
const selectedAddonIds = ref<string[]>([])
const startFreePlan = ref(false)
// Career level is required for everyone (free and paid). It is the job-matching tier and
// is stored on profiles.career_level -- never derived from the plan/product the user picks.
const careerLevel = ref<FreemiumBasePlanTierKey | ''>('')

const careerLevelOptions = CAREER_LEVEL_OPTIONS

// Presentational only — mirrors the "Most popular" badge Pricing.vue already puts on Core.
const isCorePlan = (product: Product) => product.key === 'core'

const isLoading = ref(false)
const error = ref('')

const canProceedStep1 = computed(() => {
  return (
    firstName.value.trim() &&
    lastName.value.trim() &&
    currentJobTitle.value &&
    currentIndustry.value
  )
})

const canProceedStep2 = computed(() => {
  const hasCareerLevel = FREEMIUM_BASE_PLAN_TIER_KEYS.includes(
    careerLevel.value as FreemiumBasePlanTierKey,
  )
  return (
    targetJobTitles.value.length > 0 &&
    targetRoleCategories.value.length > 0 &&
    hasCareerLevel
  )
})

const salaryRangeError = computed(() => {
  if (desiredSalaryMin.value == null || desiredSalaryMax.value == null) return null
  if (desiredSalaryMax.value < desiredSalaryMin.value) {
    return 'Max must be greater than or equal to min'
  }
  return null
})

const canProceedStep3 = computed(() => {
  return preferredLocations.value.length > 0 && !salaryRangeError.value
})

const canProceedStep5 = computed(() => {
  return startFreePlan.value || selectedBasePlanId.value !== null
})

const canProceedCurrentStep = computed(() => {
  if (currentStep.value === 1) return canProceedStep1.value
  if (currentStep.value === 2) return canProceedStep2.value
  if (currentStep.value === 3) return canProceedStep3.value
  if (currentStep.value === 4) return true
  return true
})

function getFirstIncompleteStep(): number {
  if (!canProceedStep1.value) return 1
  if (!canProceedStep2.value) return 2
  if (!canProceedStep3.value) return 3
  if (!userStore.profile?.resume_bucket_key) return 4
  return 5
}

function populateFromProfile() {
  const p = userStore.profile
  if (!p || hasPopulatedFromProfile.value) return
  hasPopulatedFromProfile.value = true

  firstName.value = p.first_name ?? ''
  lastName.value = p.last_name ?? ''
  currentJobTitle.value = p.current_job_title ?? ''
  currentIndustry.value = p.current_industry ?? ''
  careerLevel.value = (p.career_level as FreemiumBasePlanTierKey | null) ?? ''

  targetJobTitles.value = splitTagsField(p.target_job_title)
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
    subscriptionAPI.getAddonProducts(),
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
    career_level: careerLevel.value || undefined,
    target_job_title: joinTagsField(targetJobTitles.value),
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
    if (!FREEMIUM_BASE_PLAN_TIER_KEYS.includes(careerLevel.value as FreemiumBasePlanTierKey)) {
      error.value = 'Please choose which level best describes the roles you want.'
      return
    }
    const ok = await persistProfileAndResume()
    if (!ok) return

    const { error: freeError } = await freemiumAPI.completeOnboarding(careerLevel.value)
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
  <div class="app-warm-bg min-h-screen">
    <!-- Header: centered logo + step badge, progress bar with rabbit marker below (generous
    clearance so the marker's floating bounce never reaches back up into the badge). No bg of
    its own - sits directly on the page's app-warm-bg gradient instead of a stark white bar. -->
    <div class="px-4 py-6 sm:px-6">
      <div class="mx-auto flex max-w-3xl flex-col items-center gap-3">
        <img :src="jobHopperLogo" alt="Job-Hopper" class="h-7 w-auto object-contain" />
        <span class="rounded-full border border-brand-primary/20 bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary">
          Step {{ currentStep }} of {{ totalSteps }} — {{ STEP_NAMES[currentStep - 1] }}
        </span>
        <div class="relative mt-14 w-full max-w-xl pb-1">
          <div
            class="pointer-events-none absolute -top-7 transition-all duration-500 ease-out"
            :style="{ left: `calc(${((currentStep - 1) / (totalSteps - 1)) * 100}% - 13px)` }"
          >
            <img :src="jobHopperRabbitLogo" alt="" aria-hidden="true" class="floating h-[26px] w-[26px] object-contain" />
          </div>
          <div class="mt-1 flex gap-1.5">
            <div v-for="i in totalSteps" :key="i" class="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-border">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="i <= currentStep ? 'bg-brand-primary' : ''"
                :style="{ width: i <= currentStep ? '100%' : '0%' }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-col items-center px-4 py-8">
      <div :class="currentStep === 5 ? 'max-w-4xl' : 'max-w-xl'" class="w-full">
        <!-- Step 1: About You -->
        <div
          v-if="currentStep === 1"
          class="flex flex-col gap-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm sm:p-8"
        >
          <OnboardingStepHeader
            :icon="STEP_ICONS[0]"
            title="About You"
            sub="Tell us the basics to surface the best matches"
          />
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id="firstName" v-model="firstName" label="First name" required placeholder="First name" />
            <FormField id="lastName" v-model="lastName" label="Last name" required placeholder="Last name" />
          </div>
          <FormField
            id="currentJobTitle"
            v-model="currentJobTitle"
            label="Current job title"
            required
            placeholder="e.g., Maintenance Technician"
          />
          <FormField
            id="currentIndustry"
            v-model="currentIndustry"
            label="Current industry or environment"
            required
            placeholder="e.g., Technology, Healthcare, Manufacturing"
          />
          <div>
            <p class="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-body">
              Do you require sponsorship to work in the United States?
            </p>
            <div class="flex flex-wrap gap-2">
              <OnboardingChip
                label="Yes, I require sponsorship"
                :selected="requiresUsSponsorship === true"
                @click="requiresUsSponsorship = true"
              />
              <OnboardingChip
                label="No, I do not require sponsorship"
                :selected="requiresUsSponsorship === false"
                @click="requiresUsSponsorship = false"
              />
            </div>
            <p class="mt-2 text-sm text-neutral-body">
              We'll flag sponsorship likelihood using government filing data — helpful for prioritizing,
              not a guarantee.
            </p>
          </div>
        </div>

        <!-- Step 2: Role & Level -->
        <div
          v-if="currentStep === 2"
          class="flex flex-col gap-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm sm:p-8"
        >
          <OnboardingStepHeader
            :icon="STEP_ICONS[1]"
            title="Role & Level"
            sub="A rough target is enough to get started — you can fine-tune it later"
          />
          <div>
            <TagInput
              v-model="targetJobTitles"
              label="Target job title(s)"
              input-id="onboarding-target-job-titles"
              placeholder="e.g., Maintenance Supervisor — press Enter to add another"
            />
            <p class="mt-1.5 text-xs text-neutral-body">
              Add every title you'd consider — matching checks jobs against all of them.
            </p>
          </div>
          <div>
            <p class="mb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-body">
              Role categories (select all that apply)
            </p>
            <p class="mb-3 text-sm text-neutral-body">The specific kinds of roles you're open to.</p>
            <div class="flex flex-wrap gap-2">
              <OnboardingChip
                v-for="opt in ROLE_CATEGORIES"
                :key="opt.value"
                :label="opt.label"
                :selected="targetRoleCategories.includes(opt.value)"
                @click="toggleRoleCategory(opt.value)"
              />
            </div>
          </div>
          <div>
            <p class="mb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-body">
              Which level best describes the roles you want? <span class="text-red-600">*</span>
            </p>
            <p class="mb-2 text-sm text-neutral-body">The overall seniority band we'll match you within, on any plan.</p>
            <div class="flex flex-wrap gap-2">
              <OnboardingChip
                v-for="opt in careerLevelOptions"
                :key="opt.value"
                :label="opt.label"
                :selected="careerLevel === opt.value"
                @click="careerLevel = opt.value"
              />
            </div>
          </div>
        </div>

        <!-- Step 3: Compensation & Location -->
        <div
          v-if="currentStep === 3"
          class="flex flex-col gap-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm sm:p-8"
        >
          <OnboardingStepHeader
            :icon="STEP_ICONS[2]"
            title="Compensation & Location"
            sub="Set your expectations and preferred work area"
          />
          <div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                id="salaryMin"
                :model-value="desiredSalaryMin != null ? String(desiredSalaryMin) : ''"
                label="Min salary (USD/yr)"
                type="number"
                placeholder="$80,000"
                @update:model-value="desiredSalaryMin = $event ? Number($event) : null"
              />
              <FormField
                id="salaryMax"
                :model-value="desiredSalaryMax != null ? String(desiredSalaryMax) : ''"
                label="Max salary (USD/yr)"
                type="number"
                placeholder="$150,000"
                @update:model-value="desiredSalaryMax = $event ? Number($event) : null"
              />
            </div>
            <p v-if="salaryRangeError" class="mt-1 text-sm text-red-600">{{ salaryRangeError }}</p>
          </div>

          <div class="flex flex-col gap-3">
            <PreferredLocationsInput v-model="preferredLocations" label="Location preferences" input-id="preferredLocations" />
            <LocationRadiusInput v-model="locationRadius" label="Location radius" />
          </div>

          <div class="flex flex-col gap-3">
            <label class="flex items-center gap-3">
              <input v-model="openToRelocation" type="checkbox" class="h-5 w-5 rounded-md border-neutral-border accent-brand-primary" />
              <span class="text-sm text-neutral-body">Open to relocation</span>
            </label>
            <label class="flex items-center gap-3">
              <input v-model="openToRemote" type="checkbox" class="h-5 w-5 rounded-md border-neutral-border accent-brand-primary" />
              <span class="text-sm text-neutral-body">Open to remote roles</span>
            </label>
          </div>
        </div>

        <!-- Step 4: Resume Upload -->
        <div
          v-if="currentStep === 4"
          class="flex flex-col gap-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm sm:p-8"
        >
          <OnboardingStepHeader
            :icon="STEP_ICONS[3]"
            title="Resume Upload"
            sub="Optional, but recommended — improves match accuracy"
          />
          <p class="-mt-2 text-sm text-neutral-body">
            <span class="font-medium text-brand-charcoal">We use this only to improve your matches—never to sell your data.</span>
            A resume gives our matching engine more context: your skills, equipment or systems you've worked
            with, and the progression of your career. You can skip this step and come back later if you'd like.
          </p>

          <ResumeUploader
            :resume-bucket-key="userStore.profile?.resume_bucket_key ?? null"
            :auto-upload="false"
            input-id="onboarding-resume-upload"
            @file-selected="handleResumeFileSelected"
          />
        </div>

        <!-- Step 5: Plan Selection -->
        <div v-if="currentStep === 5" class="flex flex-col items-center gap-8">
          <div class="text-center">
            <h2 class="text-2xl font-heading font-bold text-brand-charcoal">Choose how you want to start</h2>
            <p class="mt-1 text-sm text-neutral-body">
              Start free, or subscribe with a 2-week trial for automated matching and email digests. Upgrade
              anytime from billing.
            </p>
          </div>

          <div class="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div class="relative flex flex-col">
              <div
                class="flex h-full flex-col gap-4 rounded-2xl border p-6"
                :class="startFreePlan ? 'border-2' : 'border'"
                :style="startFreePlan ? { borderColor: '#2F6ECC', boxShadow: '0 6px 20px rgba(47,110,204,0.12)' } : { borderColor: '#E5E7EB' }"
              >
                <div>
                  <p class="font-heading font-bold text-brand-charcoal">Free</p>
                  <p class="mt-0.5 text-sm text-neutral-body">Explore the dashboard and preview our features.</p>
                </div>
                <p class="text-3xl font-heading font-bold text-brand-primary">$0</p>
                <p class="flex-1 text-sm text-neutral-body">Manual job search, teaser insights, capped access.</p>
                <button type="button" class="btn-secondary w-full" @click="selectFreePlan">
                  {{ startFreePlan ? 'Selected' : 'Choose free' }}
                </button>
              </div>
            </div>

            <div v-for="product in basePlanProducts" :key="product.id" class="relative flex flex-col">
              <div
                v-if="isCorePlan(product)"
                class="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-primary px-4 py-[5px] text-[11px] font-bold text-white"
              >
                Most popular
              </div>
              <div
                class="flex h-full flex-col gap-4 rounded-2xl border p-6"
                :class="[!startFreePlan && selectedBasePlanId === product.id ? 'border-2' : 'border', isCorePlan(product) ? 'mt-3' : '']"
                :style="
                  !startFreePlan && selectedBasePlanId === product.id
                    ? { borderColor: '#2F6ECC', boxShadow: '0 6px 20px rgba(47,110,204,0.12)' }
                    : { borderColor: '#E5E7EB' }
                "
              >
                <div>
                  <p class="font-heading font-bold text-brand-charcoal">{{ product.display_name }}</p>
                </div>
                <p class="text-3xl font-heading font-bold text-brand-primary">
                  ${{ getProductPrice(product) }}<span class="text-sm font-normal text-neutral-body">/month</span>
                </p>
                <CoreFreeMonthBadge v-if="isCorePlan(product)" class="self-start" />
                <p class="flex-1 text-sm text-neutral-body">{{ product.description || '' }}</p>
                <button type="button" class="btn-primary w-full" @click="selectPaidPlan(product.id)">
                  {{ !startFreePlan && selectedBasePlanId === product.id ? 'Selected' : 'Select plan' }}
                </button>
              </div>
            </div>

          </div>

          <div v-if="!startFreePlan" class="w-full border-t border-neutral-border pt-6">
            <h3 class="mb-1 font-heading font-semibold text-brand-charcoal">Optional add-ons</h3>
            <p class="mb-4 text-sm text-neutral-body">Separately priced; add any you'd like.</p>
            <div class="space-y-3">
              <label v-for="product in addonProducts" :key="product.id" class="flex items-start gap-3">
                <input
                  :checked="selectedAddonIds.includes(product.id)"
                  type="checkbox"
                  class="mt-1 h-5 w-5 rounded-md border-neutral-border accent-brand-primary"
                  @change="(e) => toggleAddon(product.id, (e.target as HTMLInputElement).checked)"
                />
                <div>
                  <span class="font-medium text-brand-charcoal">{{ product.display_name }}</span>
                  <span class="block text-sm text-neutral-body">
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

        <div v-if="error" class="mt-6 rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {{ error }}
        </div>

        <div class="mt-8 flex items-center justify-between">
          <button v-if="currentStep > 1" type="button" class="btn-secondary" @click="prevStep">Back</button>
          <div v-else></div>

          <button
            v-if="currentStep < totalSteps"
            type="button"
            :disabled="!canProceedCurrentStep"
            class="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            @click="nextStep"
          >
            {{ currentStep === 4 && !resumeFile && !userStore.profile?.resume_bucket_key ? 'Skip for now' : 'Continue' }}
            <font-awesome-icon :icon="['fas', 'arrow-right']" class="text-xs" aria-hidden="true" />
          </button>
          <button
            v-else-if="startFreePlan"
            type="button"
            :disabled="!canProceedStep5 || isLoading"
            class="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            @click="handleContinueForFree"
          >
            <font-awesome-icon v-if="isLoading" :icon="['fas', 'spinner']" spin aria-hidden="true" />
            <span>{{ isLoading ? 'Saving…' : 'Continue for free' }}</span>
          </button>
          <button
            v-else
            type="button"
            :disabled="!canProceedStep5 || isLoading"
            class="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            @click="handleProceedToCheckout"
          >
            <font-awesome-icon v-if="isLoading" :icon="['fas', 'spinner']" spin aria-hidden="true" />
            <span>{{ isLoading ? 'Redirecting to checkout...' : 'Proceed to checkout' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
