<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { userAPI, subscriptionAPI, profileAPI } from '@/lib/supabase'

const user = ref<any>(null)
const subscription = ref<any>(null)
const isLoading = ref(true)
const isSaving = ref(false)
const saveSuccess = ref(false)

// Profile fields
const currentJobTitle = ref('')
const yearsOfExperience = ref<number | null>(null)
const currentIndustry = ref('')
const targetRoleCategories = ref<string[]>([])
const desiredSalaryMin = ref<number | null>(null)
const desiredSalaryMax = ref<number | null>(null)
const preferredLocations = ref<string[]>([])
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

onMounted(async () => {
  try {
    const [userResult, subscriptionResult] = await Promise.all([
      userAPI.getCurrentUserProfile(),
      subscriptionAPI.getCurrentSubscription()
    ])
    
    if (!userResult.error && userResult.data) {
      user.value = userResult.data
      currentJobTitle.value = userResult.data.current_job_title || ''
      yearsOfExperience.value = userResult.data.years_of_experience || null
      currentIndustry.value = userResult.data.current_industry || ''
      targetRoleCategories.value = userResult.data.target_role_categories || []
      desiredSalaryMin.value = userResult.data.desired_salary_min || null
      desiredSalaryMax.value = userResult.data.desired_salary_max || null
      preferredLocations.value = userResult.data.preferred_locations || []
      openToRelocation.value = userResult.data.open_to_relocation || false
      openToRemote.value = userResult.data.open_to_remote || false
    }
    
    if (!subscriptionResult.error) {
      subscription.value = subscriptionResult.data
    }
  } catch (error) {
    console.error('Error loading profile:', error)
  } finally {
    isLoading.value = false
  }
})

const toggleRoleCategory = (category: string) => {
  const index = targetRoleCategories.value.indexOf(category)
  if (index > -1) {
    targetRoleCategories.value.splice(index, 1)
  } else {
    targetRoleCategories.value.push(category)
  }
}

const handleSave = async () => {
  try {
    isSaving.value = true
    saveSuccess.value = false

    await profileAPI.updateProfile({
      current_job_title: currentJobTitle.value,
      years_of_experience: yearsOfExperience.value || undefined,
      current_industry: currentIndustry.value,
      target_role_categories: targetRoleCategories.value,
      desired_salary_min: desiredSalaryMin.value || undefined,
      desired_salary_max: desiredSalaryMax.value || undefined,
      preferred_locations: preferredLocations.value,
      open_to_relocation: openToRelocation.value,
      open_to_remote: openToRemote.value
    })

    saveSuccess.value = true
    setTimeout(() => {
      saveSuccess.value = false
    }, 3000)
  } catch (error) {
    console.error('Error saving profile:', error)
  } finally {
    isSaving.value = false
  }
}

const getTierDisplayName = (tier?: string) => {
  const tierMap: Record<string, string> = {
    entry_mid: 'Entry & Mid Level Roles',
    senior_management: 'Senior & Management Level Roles',
    director_vp_c_level: 'Director, VP & C-Level Roles'
  }
  return tierMap[tier || ''] || 'Not set'
}
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
          <p v-if="subscription?.subscription_status === 'trial'" class="text-sm text-neutral-body mt-2">
            Trial ends: {{ subscription?.trial_ends_at ? new Date(subscription.trial_ends_at).toLocaleDateString() : 'N/A' }}
          </p>
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

        <!-- Target Preferences -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Target Preferences</h2>
          <div class="space-y-6">
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-3">Role categories</label>
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

        <!-- Save Button -->
        <div class="flex justify-end">
          <button
            @click="handleSave"
            :disabled="isSaving"
            class="btn-primary disabled:opacity-50"
          >
            <span v-if="isSaving">Saving...</span>
            <span v-else-if="saveSuccess">Saved!</span>
            <span v-else>Save Changes</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

