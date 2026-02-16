<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { profileAPI } from '@/lib/supabase'
import { getTierDisplayName } from '@/lib/subscription'
import { ROLE_CATEGORIES, type RoleCategoryValue } from '@/lib/roleCategories'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const { profile, subscription, isLoading } = storeToRefs(userStore)

const initialLoadDone = ref(false)
const isSaving = ref(false)
const saveSuccess = ref(false)

// Profile fields
const currentJobTitle = ref('')
const yearsOfExperience = ref<number | null>(null)
const currentIndustry = ref('')
const targetRoleCategories = ref<RoleCategoryValue[]>([])
const desiredSalaryMin = ref<number | null>(null)
const desiredSalaryMax = ref<number | null>(null)
const preferredLocations = ref<string[]>([])
const openToRelocation = ref(false)
const openToRemote = ref(false)

// Resume
const resumeViewUrl = ref<string | null>(null)
const resumeFile = ref<File | null>(null)
const resumeFileName = ref('')
const resumeUploading = ref(false)
const resumeError = ref('')

function syncFormFromProfile() {
  const p = profile.value
  if (!p) return
  currentJobTitle.value = p.current_job_title || ''
  yearsOfExperience.value = p.years_of_experience ?? null
  currentIndustry.value = p.current_industry || ''
  targetRoleCategories.value = (p.target_role_categories ?? []) as RoleCategoryValue[]
  desiredSalaryMin.value = p.desired_salary_min ?? null
  desiredSalaryMax.value = p.desired_salary_max ?? null
  preferredLocations.value = p.preferred_locations || []
  openToRelocation.value = p.open_to_relocation || false
  openToRemote.value = p.open_to_remote || false
}

watch(profile, (p) => {
  if (p) {
    syncFormFromProfile()
    const key = p.resume_bucket_key
    if (key) {
      profileAPI.getResumeDownloadUrl(key).then(({ data: url }) => {
        resumeViewUrl.value = url || null
      })
    }
  }
}, { immediate: true })

onMounted(() => {
  // This boolean is used to determine if the auto-save feature should be enabled.
  nextTick(() => {
    initialLoadDone.value = true
  })
})

const toggleRoleCategory = (value: RoleCategoryValue) => {
  const index = targetRoleCategories.value.indexOf(value)
  if (index > -1) {
    targetRoleCategories.value.splice(index, 1)
  } else {
    targetRoleCategories.value.push(value)
  }
}

const handleResumeFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  resumeFile.value = file
  resumeFileName.value = file.name
  resumeError.value = ''
  try {
    resumeUploading.value = true
    const { data, error } = await profileAPI.uploadResume(file)
    if (error) {
      resumeError.value = error.message || 'Upload failed'
      return
    }
    if (data?.resume_bucket_key) {
      await userStore.refreshProfile()
      const { data: url } = await profileAPI.getResumeDownloadUrl(data.resume_bucket_key)
      resumeViewUrl.value = url || null
      resumeFile.value = null
      resumeFileName.value = ''
      target.value = ''
    }
  } catch (e) {
    resumeError.value = e instanceof Error ? e.message : 'Upload failed'
  } finally {
    resumeUploading.value = false
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null

const saveProfile = async () => {
  try {
    isSaving.value = true
    saveSuccess.value = false

    await profileAPI.updateProfile({
      current_job_title: currentJobTitle.value,
      years_of_experience: yearsOfExperience.value ?? undefined,
      current_industry: currentIndustry.value,
      target_role_categories: targetRoleCategories.value,
      desired_salary_min: desiredSalaryMin.value ?? undefined,
      desired_salary_max: desiredSalaryMax.value ?? undefined,
      preferred_locations: preferredLocations.value,
      open_to_relocation: openToRelocation.value,
      open_to_remote: openToRemote.value
    })

    saveSuccess.value = true
    setTimeout(() => {
      saveSuccess.value = false
    }, 2000)
    await userStore.refreshProfile()
  } catch (error) {
    console.error('Error saving profile:', error)
  } finally {
    isSaving.value = false
  }
}

const debouncedSave = () => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveProfile, 1000)
}

// Auto-save when any profile field changes (after initial load)
watch(
  () => ({
    currentJobTitle: currentJobTitle.value,
    yearsOfExperience: yearsOfExperience.value,
    currentIndustry: currentIndustry.value,
    targetRoleCategories: [...(targetRoleCategories.value ?? [])],
    desiredSalaryMin: desiredSalaryMin.value,
    desiredSalaryMax: desiredSalaryMax.value,
    preferredLocations: [...(preferredLocations.value ?? [])],
    openToRelocation: openToRelocation.value,
    openToRemote: openToRemote.value
  }),
  () => {
    if (initialLoadDone.value) debouncedSave()
  },
  { deep: true }
)
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-heading font-bold text-brand-charcoal mb-8">Your Profile</h1>

      <div v-if="isLoading" class="text-center py-12">
        <svg class="animate-spin h-8 w-8 text-brand-primary mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-neutral-body">Loading...</p>
      </div>

      <div v-else class="space-y-6">
        <!-- Subscription Info -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Current Subscription</h2>
          <p class="text-neutral-body">
            <span class="font-semibold">Plan:</span> {{ getTierDisplayName(subscription?.subscription_tier) }}
          </p>
          <p v-if="subscription?.subscription_status === 'trial'" class="text-sm text-red-600 mt-2">
            Trial ends: {{ subscription?.trial_ends_at ? new Date(subscription.trial_ends_at).toLocaleDateString() : 'N/A' }}
          </p>
          <router-link to="/billing" class="text-sm text-brand-primary font-medium mt-2 inline-block hover:underline">
            Manage Subscription
          </router-link>
        </div>

        <!-- About You -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">About You</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-2">Current job title</label>
              <input v-model="currentJobTitle" type="text" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-2">Years of experience</label>
              <input v-model.number="yearsOfExperience" type="number" min="0" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-2">Current industry</label>
              <input v-model="currentIndustry" type="text" class="input" />
            </div>
          </div>
        </div>

        <!-- Resume -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Resume</h2>
          <p class="text-sm text-neutral-body mb-4">
            A resume helps our matching engine understand your skills and experience. You can view your current resume or upload a new one.
          </p>
          <div v-if="profile?.resume_bucket_key" class="mb-4">
            <p class="text-sm font-medium text-brand-charcoal mb-2">Your current resume</p>
            <a
              :href="resumeViewUrl || '#'"
              target="_blank"
              rel="noopener noreferrer"
              class="text-brand-primary font-medium hover:underline inline-flex items-center gap-2"
              :class="{ 'pointer-events-none opacity-50': !resumeViewUrl }"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {{ resumeViewUrl ? 'View resume' : 'Loading...' }}
            </a>
          </div>
          <div class="space-y-3">
            <input
              id="profile-resume-upload"
              type="file"
              accept=".pdf,.doc,.docx"
              class="hidden"
              :disabled="resumeUploading"
              @change="handleResumeFileChange"
            />
            <label
              for="profile-resume-upload"
              class="btn-secondary cursor-pointer inline-block"
              :class="{ 'opacity-50 pointer-events-none': resumeUploading }"
            >
              {{ resumeUploading ? 'Uploading...' : (profile?.resume_bucket_key ? 'Choose new file to replace' : 'Choose file to upload') }}
            </label>
            <p v-if="resumeFileName && !resumeUploading" class="text-sm text-neutral-body">
              Selected: {{ resumeFileName }}
            </p>
            <p v-if="resumeError" class="text-sm text-red-600">{{ resumeError }}</p>
          </div>
        </div>

        <!-- Target Preferences -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Target Preferences</h2>
          <div class="space-y-6">
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-3">Role categories</label>
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
              <label class="block text-sm font-medium text-brand-charcoal mb-2">Desired salary range</label>
              <div class="grid grid-cols-2 gap-4">
                <input v-model.number="desiredSalaryMin" type="number" class="input" placeholder="Min ($)" />
                <input v-model.number="desiredSalaryMax" type="number" class="input" placeholder="Max ($)" />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-2">Preferred locations</label>
              <input
                v-model="preferredLocations[0]"
                type="text"
                class="input"
                placeholder="City, State or ZIP"
              />
            </div>

            <div class="space-y-3">
              <label class="flex items-center">
                <input v-model="openToRelocation" type="checkbox" class="mr-3 w-4 h-4" />
                <span class="text-sm text-neutral-body">Open to relocation</span>
              </label>
              <label class="flex items-center">
                <input v-model="openToRemote" type="checkbox" class="mr-3 w-4 h-4" />
                <span class="text-sm text-neutral-body">Open to remote roles</span>
              </label>
            </div>
          </div>
        </div>

        <div class="flex justify-end items-center gap-2 text-sm text-neutral-body min-h-[1.5rem]">
          <span v-if="isSaving">Saving...</span>
          <span v-else-if="saveSuccess" class="text-green-600">Saved</span>
        </div>
      </div>
    </div>
  </div>
</template>

