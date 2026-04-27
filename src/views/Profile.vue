<script setup lang="ts">
import { ref, onMounted, onActivated, watch, nextTick, computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { profileAPI } from '@/lib/profile'
import { resumeProductsAPI } from '@/lib/resumeProducts'
import { notificationsAPI, JOB_MATCH_FREQUENCY_OPTIONS } from '@/lib/notifications'
import type {
  JobMatchEmailFrequency,
  NotificationSettingsUpdate,
  ResumeProduct,
} from '@/types/database'
import { ROLE_CATEGORIES, type RoleCategoryValue } from '@/lib/roleCategories'
import { useUserStore } from '@/stores/user'
import ResumeUploader from '@/components/ResumeUploader.vue'
import ResumeAdviceModal from '@/components/ResumeAdviceModal.vue'
import PreferredLocationsInput from '@/components/PreferredLocationsInput.vue'
import LocationRadiusInput from '@/components/LocationRadiusInput.vue'

const route = useRoute()
const userStore = useUserStore()
const { profile, basePlan, isLoading } = storeToRefs(userStore)

const unsubscribeMessage = computed(() => {
  const q = route.query.unsubscribe
  if (q === 'success') return { type: 'success' as const, text: 'You have been unsubscribed from all emails.' }
  if (q === 'invalid') return { type: 'warning' as const, text: 'That unsubscribe link is invalid or has expired.' }
  if (q === 'error') return { type: 'error' as const, text: 'Something went wrong. Please try again from your profile.' }
  return null
})

const notificationSettings = ref<{
  job_match_email_enabled: boolean
  job_match_email_frequency: JobMatchEmailFrequency
  subscription_updates_email_enabled: boolean
  system_announcements_email_enabled: boolean
  email_unsubscribed_at: string | null
} | null>(null)
const notificationSettingsLoading = ref(true)
const notificationSettingsSaving = ref(false)

const initialLoadDone = ref(false)
const isSaving = ref(false)
const saveSuccess = ref(false)
/** When true, form refs are being updated from profile (e.g. after save); skip triggering another save. */
const isSyncingFromProfile = ref(false)

// Profile fields
const currentJobTitle = ref('')
const targetJobTitle = ref('')
const yearsOfExperience = ref<number | null>(null)
const currentIndustry = ref('')
const targetRoleCategories = ref<RoleCategoryValue[]>([])
const desiredSalaryMin = ref<number | null>(null)
const desiredSalaryMax = ref<number | null>(null)
const preferredLocations = ref<string[]>([])
const openToRelocation = ref(false)
const openToRemote = ref(false)
const locationRadiusMiles = ref<number | null>(null)
const requiresUsSponsorship = ref<boolean | null>(null)

const resumeUpgradePurchase = ref<ResumeProduct | null>(null)
const resumeUpgradeModalOpen = ref(false)

async function loadResumeUpgradePurchase() {
  const { data, error } = await resumeProductsAPI.getResumeUpgradePurchase()
  if (!error) {
    resumeUpgradePurchase.value = data
  }
}

/** Same rules as job cards: purchased and not cancelled → show View + modal. */
const showResumeUpgradeAdviceButton = computed(() => {
  const p = resumeUpgradePurchase.value
  if (!p || p.status === 'cancelled') return false
  return true
})

const resumeUpgradeAdviceStatusText = computed<string | null>(() => {
  const p = resumeUpgradePurchase.value
  if (!p || p.status === 'cancelled') return null
  if (p.status === 'pending') return 'Generating resume advice'
  return null
})

function syncFormFromProfile() {
  const p = profile.value
  if (!p) return
  currentJobTitle.value = p.current_job_title || ''
  targetJobTitle.value = p.target_job_title || ''
  yearsOfExperience.value = p.years_of_experience ?? null
  currentIndustry.value = p.current_industry || ''
  targetRoleCategories.value = (p.target_role_categories ?? []).filter(
    (v): v is RoleCategoryValue => ROLE_CATEGORIES.some((r) => r.value === v)
  )
  desiredSalaryMin.value = p.desired_salary_min ?? null
  desiredSalaryMax.value = p.desired_salary_max ?? null
  preferredLocations.value = p.preferred_locations || []
  openToRelocation.value = p.open_to_relocation || false
  openToRemote.value = p.open_to_remote || false
  locationRadiusMiles.value =
    typeof p.location_radius_miles === 'number' && !Number.isNaN(p.location_radius_miles)
      ? p.location_radius_miles
      : null
  requiresUsSponsorship.value =
    typeof p.requires_us_sponsorship === 'boolean' ? p.requires_us_sponsorship : null
}

// Sync from store only when the profile row first appears or the user id changes.
// Do not re-sync on every `profile` update: autosave + Supabase Realtime both refresh
// the store and would overwrite local input state while the user is typing.
watch(
  () => profile.value?.id,
  (id) => {
    if (!id) return
    isSyncingFromProfile.value = true
    syncFormFromProfile()
    nextTick(() => {
      isSyncingFromProfile.value = false
    })
  },
  { immediate: true },
)

onMounted(() => {
  // This boolean is used to determine if the auto-save feature should be enabled.
  nextTick(() => {
    initialLoadDone.value = true
  })
  loadNotificationSettings()
  void loadResumeUpgradePurchase()
})

onActivated(() => {
  void loadResumeUpgradePurchase()
})

async function loadNotificationSettings() {
  notificationSettingsLoading.value = true
  try {
    const { data } = await notificationsAPI.getNotificationSettings()
    if (data) {
      notificationSettings.value = {
        job_match_email_enabled: data.job_match_email_enabled,
        job_match_email_frequency: data.job_match_email_frequency,
        subscription_updates_email_enabled: data.subscription_updates_email_enabled,
        system_announcements_email_enabled: data.system_announcements_email_enabled,
        email_unsubscribed_at: data.email_unsubscribed_at,
      }
    }
  } finally {
    notificationSettingsLoading.value = false
  }
}

async function saveNotificationSettings(updates: Partial<NotificationSettingsUpdate>) {
  if (!notificationSettings.value) return
  notificationSettingsSaving.value = true
  try {
    const { data, error } = await notificationsAPI.updateNotificationSettings(updates)
    if (!error && data) {
      notificationSettings.value = {
        job_match_email_enabled: data.job_match_email_enabled,
        job_match_email_frequency: data.job_match_email_frequency,
        subscription_updates_email_enabled: data.subscription_updates_email_enabled,
        system_announcements_email_enabled: data.system_announcements_email_enabled,
        email_unsubscribed_at: data.email_unsubscribed_at,
      }
    }
  } finally {
    notificationSettingsSaving.value = false
  }
}

async function setUnsubscribedFromAll() {
  await saveNotificationSettings({ email_unsubscribed_at: new Date().toISOString() })
}

async function setResubscribed() {
  await saveNotificationSettings({ email_unsubscribed_at: null })
}

const toggleRoleCategory = (value: RoleCategoryValue) => {
  const index = targetRoleCategories.value.indexOf(value)
  if (index > -1) {
    targetRoleCategories.value.splice(index, 1)
  } else {
    targetRoleCategories.value.push(value)
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null

const saveProfile = async () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  try {
    isSaving.value = true
    saveSuccess.value = false

    await profileAPI.updateProfile({
      current_job_title: currentJobTitle.value,
      target_job_title: targetJobTitle.value,
      years_of_experience: yearsOfExperience.value ?? undefined,
      current_industry: currentIndustry.value,
      target_role_categories: targetRoleCategories.value,
      desired_salary_min: desiredSalaryMin.value ?? undefined,
      desired_salary_max: desiredSalaryMax.value ?? undefined,
      preferred_locations: preferredLocations.value,
      open_to_relocation: openToRelocation.value,
      open_to_remote: openToRemote.value,
      location_radius_miles: locationRadiusMiles.value ?? undefined,
      requires_us_sponsorship:
        requiresUsSponsorship.value === null ? undefined : requiresUsSponsorship.value,
    })

    saveSuccess.value = true
    setTimeout(() => {
      saveSuccess.value = false
    }, 2000)
  } catch (error) {
    console.error('Error saving profile:', error)
  } finally {
    isSaving.value = false
  }
}

const debouncedSave = () => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveProfile, 600)
}

// Auto-save when any profile field changes (after initial load)
watch(
  () => ({
    currentJobTitle: currentJobTitle.value,
    targetJobTitle: targetJobTitle.value,
    yearsOfExperience: yearsOfExperience.value,
    currentIndustry: currentIndustry.value,
    targetRoleCategories: [...(targetRoleCategories.value ?? [])],
    desiredSalaryMin: desiredSalaryMin.value,
    desiredSalaryMax: desiredSalaryMax.value,
    preferredLocations: [...(preferredLocations.value ?? [])],
    openToRelocation: openToRelocation.value,
    openToRemote: openToRemote.value,
    locationRadiusMiles: locationRadiusMiles.value,
    requiresUsSponsorship: requiresUsSponsorship.value,
  }),
  () => {
    if (initialLoadDone.value && !isSyncingFromProfile.value) debouncedSave()
  },
  { deep: true }
)
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-heading font-bold text-brand-charcoal mb-8">Your Profile</h1>

      <div v-if="isLoading" class="text-center py-12">
        <font-awesome-icon
          :icon="['fas', 'spinner']"
          spin
          class="h-8 w-8 text-brand-primary mx-auto mb-4"
          aria-hidden="true"
        />
        <p class="text-neutral-body">Loading...</p>
      </div>

      <div v-else class="space-y-6">
        <!-- Unsubscribe query param message -->
        <div
          v-if="unsubscribeMessage"
          :class="[
            'p-4 rounded-[12px]',
            unsubscribeMessage.type === 'success' && 'bg-green-50 text-green-800',
            unsubscribeMessage.type === 'warning' && 'bg-amber-50 text-amber-800',
            unsubscribeMessage.type === 'error' && 'bg-red-50 text-red-800'
          ]"
        >
          {{ unsubscribeMessage.text }}
        </div>

        <!-- Subscription Info -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Current Subscription</h2>
          <div v-if="basePlan">
            <p class="text-neutral-body">
              <span class="font-semibold">Plan:</span> {{ basePlan?.display_name }}
            </p>
          </div>
          <div v-else>
            <p class="text-neutral-body">No active plan</p>
          </div>
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
            </div>
          </div>
        </div>

        <!-- Resume -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Resume</h2>
          <p class="text-sm text-neutral-body mb-4">
            A resume helps our matching engine understand your skills and experience. You can view your current resume or upload a new one.
          </p>
          <ResumeUploader
            :resume-bucket-key="profile?.resume_bucket_key ?? null"
            :auto-upload="true"
            input-id="profile-resume-upload"
            @uploaded="userStore.refreshProfile"
          />
          <div
            v-if="showResumeUpgradeAdviceButton"
            class="mt-6 flex flex-wrap items-center gap-2 border-t border-neutral-border pt-6"
          >
            <button
              type="button"
              class="btn-secondary text-sm"
              @click="resumeUpgradeModalOpen = true"
            >
              View resume advice
            </button>
            <p
              v-if="resumeUpgradeAdviceStatusText"
              class="text-xs text-neutral-body"
            >
              {{ resumeUpgradeAdviceStatusText }}
            </p>
          </div>
          <ResumeAdviceModal
            :open="resumeUpgradeModalOpen"
            modal-title="Your resume advice"
            :advice-text="resumeUpgradePurchase?.improvements_text"
            @close="resumeUpgradeModalOpen = false"
          />
        </div>

        <!-- Target Preferences -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Target Preferences</h2>
          <div class="space-y-6">
            <div>
              <label class="block text-sm font-medium text-brand-charcoal mb-2">Target job title</label>
              <input v-model="targetJobTitle" type="text" class="input" />
            </div>
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
              <PreferredLocationsInput
                v-model="preferredLocations"
                label="Preferred locations"
                input-id="profile-preferred-locations"
              />
            </div>

            <div>
              <LocationRadiusInput
                v-model="locationRadiusMiles"
                label="Location radius (miles)"
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

        <!-- Email / Notification Preferences -->
        <div class="card p-6">
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Email preferences</h2>
          <p class="text-sm text-neutral-body mb-4">
            Choose which emails you receive. You can change these anytime.
          </p>
          <div v-if="notificationSettingsLoading" class="text-neutral-body text-sm">Loading...</div>
          <div v-else-if="notificationSettings" class="space-y-4">
            <div v-if="notificationSettings.email_unsubscribed_at" class="p-3 bg-neutral-bg rounded-[12px]">
              <p class="text-sm text-neutral-body mb-2">You are unsubscribed from all Job-Hopper emails.</p>
              <button
                type="button"
                class="btn-primary text-sm"
                :disabled="notificationSettingsSaving"
                @click="setResubscribed"
              >
                Re-enable emails
              </button>
            </div>
            <template v-else>
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-4">
                  <label class="flex items-center gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      class="w-4 h-4"
                      :checked="notificationSettings.job_match_email_enabled"
                      :disabled="notificationSettingsSaving"
                      @change="saveNotificationSettings({ job_match_email_enabled: !notificationSettings.job_match_email_enabled })"
                    />
                    <span class="text-sm text-brand-charcoal">Job match emails</span>
                  </label>
                  <div
                    v-if="notificationSettings.job_match_email_enabled"
                    class="flex items-center gap-2"
                  >
                    <label class="block text-xs font-medium text-neutral-body">Frequency</label>
                    <select
                      :value="notificationSettings.job_match_email_frequency"
                      class="input text-sm max-w-xs"
                      :disabled="notificationSettingsSaving"
                      @change="saveNotificationSettings({ job_match_email_frequency: ($event.target as HTMLSelectElement).value as JobMatchEmailFrequency })"
                    >
                      <option
                        v-for="opt in JOB_MATCH_FREQUENCY_OPTIONS"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </select>
                  </div>
                </div>
              </div>
              <label class="flex items-center gap-3">
                <input
                  type="checkbox"
                  class="w-4 h-4"
                  :checked="notificationSettings.subscription_updates_email_enabled"
                  :disabled="notificationSettingsSaving"
                  @change="saveNotificationSettings({ subscription_updates_email_enabled: !notificationSettings.subscription_updates_email_enabled })"
                />
                <span class="text-sm text-brand-charcoal">Subscription updates</span>
              </label>
              <label class="flex items-center gap-3">
                <input
                  type="checkbox"
                  class="w-4 h-4"
                  :checked="notificationSettings.system_announcements_email_enabled"
                  :disabled="notificationSettingsSaving"
                  @change="saveNotificationSettings({ system_announcements_email_enabled: !notificationSettings.system_announcements_email_enabled })"
                />
                <span class="text-sm text-brand-charcoal">System announcements</span>
              </label>
              <div class="pt-2 border-t border-neutral-border">
                <button
                  type="button"
                  class="text-sm text-red-600 hover:underline"
                  :disabled="notificationSettingsSaving"
                  @click="setUnsubscribedFromAll"
                >
                  Unsubscribe from all emails
                </button>
              </div>
            </template>
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

