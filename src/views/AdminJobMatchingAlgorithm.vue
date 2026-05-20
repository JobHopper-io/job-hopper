<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from 'vue'
import { profileAPI } from '@/lib/profile'
import { subscriptionAPI } from '@/lib/subscription'
import {
  jobMatchingAlgorithmAdminAPI,
  DEFAULT_ADMIN_MATCH_CONFIG,
  type MatchJobsResponse,
  type RankedJob,
  type MatchJobsDebugPayload,
  type SubscriberPreferencesOverride,
  type MatchConfigOverride,
  type AdminMatchingConfig,
  type OnboardedMatchingSubscriberRow,
  type SubscriberMatchingPreferencesPayload,
} from '@/lib/admin-job-matching-algorithm'
import type { Profile } from '@/types/database'
import PreferredLocationsInput from '@/components/PreferredLocationsInput.vue'

const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const result = ref<MatchJobsResponse | null>(null)

const isConfigLoading = ref(false)
const activeConfig = ref<AdminMatchingConfig | null>(null)
const configs = ref<AdminMatchingConfig[]>([])
const isConfigModalOpen = ref(false)
const isSaveConfigModalOpen = ref(false)
const isOverrideWarningOpen = ref(false)
const configToOverride = ref<AdminMatchingConfig | null>(null)
const isArchiveConfirmOpen = ref(false)
const configToArchive = ref<AdminMatchingConfig | null>(null)
const isArchivingConfig = ref(false)
const configArchiveError = ref<string | null>(null)
const saveConfigName = ref('')
const saveConfigMakeActive = ref(false)
const overrideConfirmationText = ref('')

/** `products.key` for all base_plan rows; shown in the subscription tier field label. */
const basePlanProductKeyOptions = ref<string[]>([])

/** Empty string = use logged-in admin profile as match subject; otherwise profile id under test. */
const matchSubjectProfileId = ref('')
const suppressMatchSubjectWatch = ref(false)
const onboardedSubscribers = ref<OnboardedMatchingSubscriberRow[]>([])
const isOnboardedListLoading = ref(false)
const onboardedListError = ref<string | null>(null)
const onboardedListTruncated = ref(false)
const isApplyingMatchSubject = ref(false)

// Preferences form (defaults from user profile)
const prefsForm = reactive<{
  subscriptionTierProductKeys: string
  roles: string
  targetJobTitle: string
  currentJobTitle: string
  currentIndustry: string
  payRangeMin: string
  payRangeMax: string
  preferredLocations: string[]
  openToRelocation: boolean
  openToRemote: boolean
  locationRadiusMiles: string
}>({
  subscriptionTierProductKeys: '',
  roles: '',
  targetJobTitle: '',
  currentJobTitle: '',
  currentIndustry: '',
  payRangeMin: '',
  payRangeMax: '',
  preferredLocations: [],
  openToRelocation: false,
  openToRemote: false,
  locationRadiusMiles: '',
})

// Match config form (defaults from DEFAULT_ADMIN_MATCH_CONFIG)
const configForm = reactive<MatchConfigOverride>({
  phraseWeights: {
    primary: { ...DEFAULT_ADMIN_MATCH_CONFIG.phraseWeights!.primary },
    secondary: { ...DEFAULT_ADMIN_MATCH_CONFIG.phraseWeights!.secondary },
    industry: { ...DEFAULT_ADMIN_MATCH_CONFIG.phraseWeights!.industry },
  },
  phraseMatching: { ...DEFAULT_ADMIN_MATCH_CONFIG.phraseMatching },
  payWeights: { ...DEFAULT_ADMIN_MATCH_CONFIG.payWeights },
  locationWeights: { ...DEFAULT_ADMIN_MATCH_CONFIG.locationWeights },
  recencyWeights: { ...DEFAULT_ADMIN_MATCH_CONFIG.recencyWeights },
  thresholds: { ...DEFAULT_ADMIN_MATCH_CONFIG.thresholds },
})

const JOBS_PER_PAGE = 25
const currentPage = ref(1)

const jobs = computed<RankedJob[]>(() => result.value?.jobs ?? [])
const totalPages = computed(() => Math.max(1, Math.ceil(jobs.value.length / JOBS_PER_PAGE)))
const pagedJobs = computed(() => {
  const start = (currentPage.value - 1) * JOBS_PER_PAGE
  return jobs.value.slice(start, start + JOBS_PER_PAGE)
})
const pageRangeLabel = computed(() => {
  if (jobs.value.length === 0) return '0'
  const start = (currentPage.value - 1) * JOBS_PER_PAGE + 1
  const end = Math.min(currentPage.value * JOBS_PER_PAGE, jobs.value.length)
  return `${start}–${end}`
})

const debug = computed<MatchJobsDebugPayload | null>(
  () => result.value?.debug ?? null,
)

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}

async function loadSubscriptionTierKeys(profileId: string) {
  const { data } = await subscriptionAPI.getSubscriptionTierProductKeysForProfile(profileId)
  prefsForm.subscriptionTierProductKeys = (data ?? []).join(', ')
}

async function loadAdminPreferencesOnly() {
  const { data: profile } = await profileAPI.getCurrentUserProfile()
  profileToPrefsForm(profile ?? null)
  if (profile?.id) {
    await loadSubscriptionTierKeys(profile.id)
  }
}

function applySubscriberPreferencesPayloadToForm(p: SubscriberMatchingPreferencesPayload) {
  prefsForm.subscriptionTierProductKeys = p.subscriptionTierProductKeys.join(', ')
  prefsForm.roles = p.roles.length ? p.roles.join(', ') : ''
  prefsForm.targetJobTitle = p.targetJobTitle ?? ''
  prefsForm.currentJobTitle = p.currentJobTitle ?? ''
  prefsForm.currentIndustry = p.currentIndustry ?? ''
  prefsForm.payRangeMin = p.payRangeMin != null ? String(p.payRangeMin) : ''
  prefsForm.payRangeMax = p.payRangeMax != null ? String(p.payRangeMax) : ''
  prefsForm.preferredLocations = Array.isArray(p.preferredLocations) ? p.preferredLocations.slice() : []
  prefsForm.openToRelocation = p.openToRelocation === true
  prefsForm.openToRemote = p.openToRemote === true
  prefsForm.locationRadiusMiles =
    p.locationRadiusMiles != null ? String(p.locationRadiusMiles) : ''
}

async function loadSubscriberPreferencesIntoForm(profileId: string) {
  const { data, error } =
    await jobMatchingAlgorithmAdminAPI.getSubscriberPreferencesForMatching(profileId)
  if (error || !data) {
    errorMessage.value = error?.message ?? 'Failed to load subscriber preferences'
    return
  }
  applySubscriberPreferencesPayloadToForm(data.preferences)
}

async function loadOnboardedSubscribers() {
  isOnboardedListLoading.value = true
  onboardedListError.value = null
  const { data, error } = await jobMatchingAlgorithmAdminAPI.listOnboardedMatchingSubscribers()
  if (error) {
    onboardedListError.value = error.message
    onboardedSubscribers.value = []
    onboardedListTruncated.value = false
  } else {
    onboardedSubscribers.value = data?.subscribers ?? []
    onboardedListTruncated.value = data?.truncated ?? false
  }
  isOnboardedListLoading.value = false
}

function displayNameForSubscriberRow(u: OnboardedMatchingSubscriberRow): string {
  const n = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  if (n.length > 0) return n
  if (u.email) return u.email
  return u.id
}

function formatSubscriberOptionLabel(u: OnboardedMatchingSubscriberRow): string {
  const label = displayNameForSubscriberRow(u)
  const emailPart = u.email ? ` <${u.email}>` : ''
  const sub = u.hasActiveSubscription ? 'Active subscription' : 'No active subscription'
  return `${label}${emailPart} — ${sub}`
}

watch(matchSubjectProfileId, async (id) => {
  if (suppressMatchSubjectWatch.value) return
  isApplyingMatchSubject.value = true
  errorMessage.value = null
  try {
    if (id === '') {
      await loadAdminPreferencesOnly()
    } else {
      await loadSubscriberPreferencesIntoForm(id)
    }
  } finally {
    isApplyingMatchSubject.value = false
  }
})

const subscriptionTierFieldPlaceholder = computed(() =>
  matchSubjectProfileId.value
    ? 'Empty = use tier keys from the selected account (trial/active base plan, same as production)'
    : 'Empty = use keys from your active base plan (same as production matching)',
)

async function loadBasePlanProductKeyOptions() {
  const { data } = await subscriptionAPI.listBasePlanProductKeys()
  basePlanProductKeyOptions.value = data ?? []
}

function profileToPrefsForm(p: Profile | null) {
  if (!p) return
  prefsForm.roles = Array.isArray(p.target_role_categories)
    ? (p.target_role_categories as string[]).join(', ')
    : ''
  prefsForm.targetJobTitle = p.target_job_title ?? ''
  prefsForm.currentJobTitle = p.current_job_title ?? ''
  prefsForm.currentIndustry = p.current_industry ?? ''
  prefsForm.payRangeMin = p.desired_salary_min != null ? String(p.desired_salary_min) : ''
  prefsForm.payRangeMax = p.desired_salary_max != null ? String(p.desired_salary_max) : ''
  prefsForm.preferredLocations = Array.isArray(p.preferred_locations)
    ? (p.preferred_locations as string[]).slice()
    : []
  prefsForm.openToRelocation = p.open_to_relocation === true
  prefsForm.openToRemote = p.open_to_remote === true
  prefsForm.locationRadiusMiles =
    p.location_radius_miles != null ? String(p.location_radius_miles) : ''
}

function buildPreferencesOverride(): SubscriberPreferencesOverride {
  const roles = prefsForm.roles
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const tierRaw = prefsForm.subscriptionTierProductKeys.trim()
  const subscriptionTierProductKeys =
    tierRaw.length > 0
      ? tierRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined
  return {
    ...(subscriptionTierProductKeys !== undefined && subscriptionTierProductKeys.length > 0
      ? { subscriptionTierProductKeys }
      : {}),
    roles: roles.length ? roles : undefined,
    targetJobTitle: prefsForm.targetJobTitle.trim() || null,
    currentJobTitle: prefsForm.currentJobTitle || null,
    currentIndustry: prefsForm.currentIndustry || null,
    payRangeMin:
      prefsForm.payRangeMin !== '' && !Number.isNaN(Number(prefsForm.payRangeMin))
        ? Number(prefsForm.payRangeMin)
        : undefined,
    payRangeMax:
      prefsForm.payRangeMax !== '' && !Number.isNaN(Number(prefsForm.payRangeMax))
        ? Number(prefsForm.payRangeMax)
        : undefined,
    preferredLocations:
      prefsForm.preferredLocations.length > 0 ? prefsForm.preferredLocations : undefined,
    openToRelocation: prefsForm.openToRelocation,
    openToRemote: prefsForm.openToRemote,
    locationRadiusMiles:
      prefsForm.locationRadiusMiles !== '' && !Number.isNaN(Number(prefsForm.locationRadiusMiles))
        ? Number(prefsForm.locationRadiusMiles)
        : undefined,
  }
}

function snapshotPhraseWeights(src: MatchConfigOverride['phraseWeights']): NonNullable<
  MatchConfigOverride['phraseWeights']
> {
  return {
    primary: { ...src?.primary },
    secondary: { ...src?.secondary },
    industry: { ...src?.industry },
  }
}

function buildMatchConfigOverride(): MatchConfigOverride {
  return {
    phraseWeights: snapshotPhraseWeights(configForm.phraseWeights),
    phraseMatching: { ...configForm.phraseMatching },
    payWeights: { ...configForm.payWeights },
    locationWeights: { ...configForm.locationWeights },
    recencyWeights: { ...configForm.recencyWeights },
    thresholds: { ...configForm.thresholds },
  }
}

async function resetToDefaults() {
  suppressMatchSubjectWatch.value = true
  matchSubjectProfileId.value = ''
  await loadAdminPreferencesOnly()
  suppressMatchSubjectWatch.value = false
  if (activeConfig.value) {
    configForm.phraseWeights = snapshotPhraseWeights(activeConfig.value.config.phraseWeights)
    configForm.phraseMatching = { ...(activeConfig.value.config.phraseMatching ?? {}) }
    configForm.payWeights = { ...(activeConfig.value.config.payWeights ?? {}) }
    configForm.locationWeights = { ...(activeConfig.value.config.locationWeights ?? {}) }
    configForm.recencyWeights = { ...(activeConfig.value.config.recencyWeights ?? {}) }
    configForm.thresholds = { ...(activeConfig.value.config.thresholds ?? {}) }
  } else {
    configForm.phraseWeights = snapshotPhraseWeights(DEFAULT_ADMIN_MATCH_CONFIG.phraseWeights)
    configForm.phraseMatching = { ...DEFAULT_ADMIN_MATCH_CONFIG.phraseMatching }
    configForm.payWeights = { ...DEFAULT_ADMIN_MATCH_CONFIG.payWeights }
    configForm.locationWeights = { ...DEFAULT_ADMIN_MATCH_CONFIG.locationWeights }
    configForm.recencyWeights = { ...DEFAULT_ADMIN_MATCH_CONFIG.recencyWeights }
    configForm.thresholds = { ...DEFAULT_ADMIN_MATCH_CONFIG.thresholds }
  }
}

function applyConfigToForm(cfg: MatchConfigOverride | undefined) {
  if (!cfg) return
  configForm.phraseWeights = snapshotPhraseWeights(cfg.phraseWeights)
  configForm.phraseMatching = { ...(cfg.phraseMatching ?? {}) }
  configForm.payWeights = { ...(cfg.payWeights ?? {}) }
  configForm.locationWeights = { ...(cfg.locationWeights ?? {}) }
  configForm.recencyWeights = { ...(cfg.recencyWeights ?? {}) }
  configForm.thresholds = { ...(cfg.thresholds ?? {}) }
}

async function openConfigModal() {
  isConfigLoading.value = true
  const { data, error } = await jobMatchingAlgorithmAdminAPI.listConfigs()
  if (!error) {
    configs.value = data
    activeConfig.value = data.find((c) => c.active) ?? activeConfig.value
  }
  isConfigLoading.value = false
  isConfigModalOpen.value = true
}

function applyConfigFromList(cfg: AdminMatchingConfig) {
  applyConfigToForm(cfg.config)
  isConfigModalOpen.value = false
}

function openSaveConfigModal() {
  saveConfigName.value = activeConfig.value?.name ?? ''
  saveConfigMakeActive.value = true
  isSaveConfigModalOpen.value = true
}

async function saveCurrentAsConfig() {
  if (!saveConfigName.value.trim()) return
  const override = buildMatchConfigOverride()
  const { data, error } = await jobMatchingAlgorithmAdminAPI.createConfigFromOverride(
    saveConfigName.value.trim(),
    override,
    saveConfigMakeActive.value,
  )
  if (!error && data) {
    activeConfig.value = data.active ? data : activeConfig.value
    isSaveConfigModalOpen.value = false
  }
}

function openOverrideWarning(cfg: AdminMatchingConfig) {
  configToOverride.value = cfg
  overrideConfirmationText.value = ''
  isOverrideWarningOpen.value = true
}

async function confirmOverrideActiveConfig() {
  const target = configToOverride.value
  if (!target) return
  if (overrideConfirmationText.value.trim().toUpperCase() !== 'OVERRIDE') {
    return
  }
  const override = buildMatchConfigOverride()
  const { data, error } = await jobMatchingAlgorithmAdminAPI.updateConfigFromOverride(
    target.id,
    target.name,
    override,
    undefined,
  )
  if (!error && data) {
    activeConfig.value = data
    isOverrideWarningOpen.value = false
    isConfigModalOpen.value = false
  }
}

async function overrideConfigWithoutWarning(cfg: AdminMatchingConfig) {
  const override = buildMatchConfigOverride()
  const { data, error } = await jobMatchingAlgorithmAdminAPI.updateConfigFromOverride(
    cfg.id,
    cfg.name,
    override,
    undefined,
  )
  if (!error && data) {
    if (data.active) {
      activeConfig.value = data
    }
    isConfigModalOpen.value = false
  }
}

function handleOverrideClick(cfg: AdminMatchingConfig) {
  if (cfg.active) {
    openOverrideWarning(cfg)
  } else {
    void overrideConfigWithoutWarning(cfg)
  }
}

function openArchiveConfirm(cfg: AdminMatchingConfig) {
  if (cfg.active) return
  configToArchive.value = cfg
  configArchiveError.value = null
  isArchiveConfirmOpen.value = true
}

async function confirmArchiveConfig() {
  const target = configToArchive.value
  if (!target || target.active) return

  isArchivingConfig.value = true
  configArchiveError.value = null

  const { error } = await jobMatchingAlgorithmAdminAPI.archiveConfig(target.id)

  isArchivingConfig.value = false

  if (error) {
    configArchiveError.value = error.message
    return
  }

  configs.value = configs.value.filter((c) => c.id !== target.id)
  isArchiveConfirmOpen.value = false
  configToArchive.value = null
}

async function loadMatches() {
  isLoading.value = true
  errorMessage.value = null

  const { data, error } = await jobMatchingAlgorithmAdminAPI.getAdminMatches({
    targetProfileId: matchSubjectProfileId.value || undefined,
    preferencesOverride: buildPreferencesOverride(),
    matchConfigOverride: buildMatchConfigOverride(),
  })

  if (error) {
    errorMessage.value = error.message
    result.value = null
  } else {
    result.value = data
    currentPage.value = 1
  }

  isLoading.value = false
}

function formatJobPostedDate(job: RankedJob): string {
  const iso = job.postedDate ?? job.createdAt
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatPhraseMatchCell(job: RankedJob): string {
  const pm = job.phraseMatch
  if (!pm) return '—'
  const parts: string[] = []
  for (const tier of ['primary', 'secondary', 'industry'] as const) {
    const by = pm.matchedBySurface[tier]
    if (!by) continue
    for (const surf of ['title', 'description', 'briefing'] as const) {
      const v = by[surf]
      if (v) parts.push(`${tier}:${surf}=${v}`)
    }
  }
  return parts.length > 0 ? parts.join(' ') : '—'
}

onMounted(async () => {
  await Promise.all([loadBasePlanProductKeyOptions(), loadOnboardedSubscribers()])
  await loadAdminPreferencesOnly()

  isConfigLoading.value = true
  const { data, error } = await jobMatchingAlgorithmAdminAPI.listConfigs()
  if (!error) {
    configs.value = data
    const active = data.find((c) => c.active) ?? null
    if (active) {
      activeConfig.value = active
      applyConfigToForm(active.config)
    }
  }
  isConfigLoading.value = false
})
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-6xl mx-auto space-y-6">
      <header class="mb-2">
        <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-brand-charcoal mb-1">
          Admin · Job Matching Algorithm
        </h1>
        <p class="text-sm sm:text-base text-neutral-body max-w-3xl">
          Run the same scoring pipeline as production.
        </p>
      </header>

      <!-- Preferences & config form -->
      <div class="card p-4 sm:p-6 space-y-6">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Algorithm input
        </h2>

        <div class="rounded-xl border border-neutral-border/80 bg-neutral-bg/80 px-3 py-3 sm:px-4 sm:py-4 space-y-2">
          <label class="block text-xs font-medium text-neutral-body" for="admin-match-subject">
            Match as subscriber
          </label>
          <select
            id="admin-match-subject"
            v-model="matchSubjectProfileId"
            class="input w-full text-sm"
            :disabled="isOnboardedListLoading || isApplyingMatchSubject"
          >
            <option value="">
              Your profile (logged-in admin)
            </option>
            <option
              v-for="u in onboardedSubscribers"
              :key="u.id"
              :value="u.id"
            >
              {{ formatSubscriberOptionLabel(u) }}
            </option>
          </select>
          <p v-if="isOnboardedListLoading" class="text-xs text-neutral-body">
            Loading onboarded subscribers…
          </p>
          <p v-else-if="onboardedListError" class="text-xs text-red-700">
            {{ onboardedListError }}
          </p>
          <p v-else-if="isApplyingMatchSubject" class="text-xs text-neutral-body">
            Loading preferences…
          </p>
          <p v-else-if="onboardedListTruncated" class="text-xs text-amber-800">
            List shows the first 10,000 onboarded profiles (alphabetically by email). Use your own records to find others if needed.
          </p>
          <p v-else class="text-xs text-neutral-body">
            Choose a completed-onboarding user to load their preferences into the fields below and run matching as them.
            Tier keys follow their trial/active subscriptions unless you override the field.
          </p>
        </div>

        <section class="space-y-3">
          <h3 class="text-sm font-heading font-semibold text-brand-charcoal">
            Preferences
          </h3>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="block text-xs font-medium text-neutral-body mb-1">
                Subscription tier product keys (comma-separated, optional override)
                <span v-if="basePlanProductKeyOptions.length" class="font-normal">
                  ({{ basePlanProductKeyOptions.join(', ') }})
                </span>
              </label>
              <input
                v-model="prefsForm.subscriptionTierProductKeys"
                type="text"
                class="input w-full"
                :placeholder="subscriptionTierFieldPlaceholder"
              >
              <p class="text-xs text-neutral-body mt-1">
                Must match <code class="text-xs">job_hopper_live.subscription_tier</code> for a job to be scored.
              </p>
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">
                Target role categories (comma-separated; must match <code class="text-[10px]">job_hopper_live.role_category</code> values)
              </label>
              <input
                v-model="prefsForm.roles"
                type="text"
                class="input w-full"
                placeholder="e.g. maintenance, engineering"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Target job title (comma-separated keyword phrases)</label>
              <input
                v-model="prefsForm.targetJobTitle"
                type="text"
                class="input w-full"
                placeholder="Primary source for title keywords when filled"
              >
              <p class="text-[11px] text-neutral-body mt-1">
                If empty, title keywords fall back to current job title.
              </p>
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Current job title (fallback for title keywords)</label>
              <input
                v-model="prefsForm.currentJobTitle"
                type="text"
                class="input w-full"
                placeholder="Used when target job title is empty"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Current industry (comma-separated keywords)</label>
              <input
                v-model="prefsForm.currentIndustry"
                type="text"
                class="input w-full"
                placeholder="e.g. Tech, Finance"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Desired salary min (annual)</label>
              <input
                v-model="prefsForm.payRangeMin"
                type="number"
                class="input w-full"
                placeholder="Compared after normalizing job pay to annual"
              >
              <p class="text-[11px] text-neutral-body mt-1">
                Job pay uses <code class="text-[10px]">pay_type</code> (year, month, week, day, hour) to convert to an annual band before overlap scoring.
              </p>
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Desired salary max (annual)</label>
              <input
                v-model="prefsForm.payRangeMax"
                type="number"
                class="input w-full"
                placeholder="Compared after normalizing job pay to annual"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-neutral-body mb-1">Location radius (miles)</label>
              <input
                v-model="prefsForm.locationRadiusMiles"
                type="number"
                min="0"
                class="input w-full"
                placeholder="e.g. 25"
              >
            </div>
            <div>
              <PreferredLocationsInput
                v-model="prefsForm.preferredLocations"
                label="Preferred locations"
                input-id="admin-preferred-locations"
              />
            </div>
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="prefsForm.openToRelocation"
                  type="checkbox"
                  class="rounded border-neutral-border"
                >
                <span class="text-sm text-neutral-body">Open to relocation</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="prefsForm.openToRemote"
                  type="checkbox"
                  class="rounded border-neutral-border"
                >
                <span class="text-sm text-neutral-body">Open to remote</span>
              </label>
            </div>
          </div>
        </section>

        <section class="space-y-3 border-t border-neutral-border pt-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-heading font-semibold text-brand-charcoal">
                Match config
              </h3>
              <p class="text-xs text-neutral-body" v-if="activeConfig">
                <span class="font-semibold">Active config:</span>
                <span>{{ activeConfig.name }}</span>
                <span class="ml-2 text-[11px] text-neutral-subtle">
                  (updated {{ new Date(activeConfig.updatedAt).toLocaleString() }})
                </span>
              </p>
              <p class="text-xs text-neutral-body" v-else>
                Using built-in default config (no active DB config found).
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="btn-secondary text-xs"
                :disabled="isConfigLoading"
                @click="openConfigModal"
              >
                Choose config…
              </button>
              <button
                type="button"
                class="btn-secondary text-xs"
                @click="openSaveConfigModal"
              >
                Save current as config…
              </button>
            </div>
          </div>
          <div class="rounded-2xl border border-neutral-border/70 bg-neutral-bg px-3 py-3 sm:px-4 sm:py-4">
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div class="space-y-3 bg-white rounded-lg shadow-sm px-3 py-2.5 sm:col-span-2 xl:col-span-4">
                <p class="text-xs font-semibold text-neutral-body">
                  Phrase matching
                </p>
                <p class="text-[11px] text-neutral-body">
                  Weights apply per matched phrase; score includes phrase word count. Use 0 on a surface to ignore it. With a target/current title, at least one primary phrase must match on a surface with non-zero primary weights.
                </p>
                <div class="flex flex-wrap items-center gap-2">
                  <input
                    v-model.number="configForm.phraseMatching!.minPrimaryWords"
                    type="number"
                    min="1"
                    class="input w-28 shrink-0 text-sm"
                    title="Minimum words for a title/industry n-gram to count as primary (single-word primaries allowed only when not a stop word)"
                  >
                  <span class="text-[11px] text-neutral-body">minPrimaryWords</span>
                </div>
                <div class="grid gap-3 sm:grid-cols-3">
                  <div class="space-y-1.5 rounded border border-neutral-border/60 p-2">
                    <p class="text-[11px] font-semibold text-brand-charcoal">
                      Primary (title intent)
                    </p>
                    <div class="flex items-center gap-2">
                      <input v-model.number="configForm.phraseWeights!.primary!.title" type="number" class="input w-28 shrink-0 text-sm">
                      <span class="text-[11px] text-neutral-body truncate">title</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <input v-model.number="configForm.phraseWeights!.primary!.description" type="number" class="input w-28 shrink-0 text-sm">
                      <span class="text-[11px] text-neutral-body truncate">description</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <input v-model.number="configForm.phraseWeights!.primary!.briefing" type="number" class="input w-28 shrink-0 text-sm">
                      <span class="text-[11px] text-neutral-body truncate">briefing</span>
                    </div>
                  </div>
                  <div class="space-y-1.5 rounded border border-neutral-border/60 p-2">
                    <p class="text-[11px] font-semibold text-brand-charcoal">
                      Secondary (title)
                    </p>
                    <div class="flex items-center gap-2">
                      <input v-model.number="configForm.phraseWeights!.secondary!.title" type="number" class="input w-28 shrink-0 text-sm">
                      <span class="text-[11px] text-neutral-body truncate">title</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <input v-model.number="configForm.phraseWeights!.secondary!.description" type="number" class="input w-28 shrink-0 text-sm">
                      <span class="text-[11px] text-neutral-body truncate">description</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <input v-model.number="configForm.phraseWeights!.secondary!.briefing" type="number" class="input w-28 shrink-0 text-sm">
                      <span class="text-[11px] text-neutral-body truncate">briefing</span>
                    </div>
                  </div>
                  <div class="space-y-1.5 rounded border border-neutral-border/60 p-2">
                    <p class="text-[11px] font-semibold text-brand-charcoal">
                      Industry
                    </p>
                    <div class="flex items-center gap-2">
                      <input v-model.number="configForm.phraseWeights!.industry!.title" type="number" class="input w-28 shrink-0 text-sm">
                      <span class="text-[11px] text-neutral-body truncate">title</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <input v-model.number="configForm.phraseWeights!.industry!.description" type="number" class="input w-28 shrink-0 text-sm">
                      <span class="text-[11px] text-neutral-body truncate">description</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <input v-model.number="configForm.phraseWeights!.industry!.briefing" type="number" class="input w-28 shrink-0 text-sm">
                      <span class="text-[11px] text-neutral-body truncate">briefing</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="space-y-2 bg-white rounded-lg shadow-sm px-3 py-2.5">
                <p class="text-xs font-semibold text-neutral-body">Pay weights</p>
                <div class="space-y-1.5">
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.payWeights!.insideRange"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Score when job salary range overlaps your desired range"
                    >
                    <span class="text-[11px] text-neutral-body truncate" title="Score when job salary range overlaps your desired range">insideRange</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.payWeights!.nearRange"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Score when job salary is slightly above or below your range (within tolerance)"
                    >
                    <span class="text-[11px] text-neutral-body truncate" title="Score when job salary is slightly above or below your range (within tolerance)">nearRange</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.payWeights!.missingSalary"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Score when job has no salary listed"
                    >
                    <span class="text-[11px] text-neutral-body truncate" title="Score when job has no salary listed">missingSalary</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.payWeights!.belowRangePenalty"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Penalty when job salary is below your range (beyond tolerance)"
                    >
                    <span class="text-[11px] text-neutral-body truncate" title="Penalty when job salary is below your range (beyond tolerance)">belowRangePenalty</span>
                  </div>
                </div>
              </div>

              <div class="space-y-2 bg-white rounded-lg shadow-sm px-3 py-2.5">
                <p class="text-xs font-semibold text-neutral-body">Recency weights</p>
                <div class="space-y-1.5">
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.recencyWeights!.baseRecency"
                      type="number"
                      step="0.1"
                      class="input w-28 shrink-0 text-sm"
                      title="Base score for job recency; decay is applied per day"
                    >
                    <span class="text-[11px] text-neutral-body truncate" title="Base score for job recency; decay is applied per day">baseRecency</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.recencyWeights!.perDayDecay"
                      type="number"
                      step="0.01"
                      class="input w-28 shrink-0 text-sm"
                      title="Amount subtracted from recency score per day since posted"
                    >
                    <span class="text-[11px] text-neutral-body truncate" title="Amount subtracted from recency score per day since posted">perDayDecay</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.recencyWeights!.maxAgeDays"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Jobs older than this many days are excluded before scoring (SQL + in-memory hard filter)"
                    >
                    <span class="text-[11px] text-neutral-body truncate" title="Jobs older than this many days are excluded before scoring (SQL + in-memory hard filter)">maxAgeDays</span>
                  </div>
                </div>
              </div>

              <div class="space-y-2 bg-white rounded-lg shadow-sm px-3 py-2.5">
                <p class="text-xs font-semibold text-neutral-body">Thresholds</p>
                <div class="space-y-1.5">
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.thresholds!.minTotalScore"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Minimum total score for a job to be included in results"
                    >
                    <span class="text-[11px] text-neutral-body truncate" title="Minimum total score for a job to be included in results">minTotalScore</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.thresholds!.noKeywordMatchPenalty"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Penalty when user has title (target else current) or industry keywords but the job matches none (job is excluded if role score drops below half this magnitude)"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Penalty when user has title (target else current) or industry keywords but the job matches none (job is excluded if role score drops below half this magnitude)"
                    >noKeywordMatchPenalty</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.thresholds!.overPayTolerancePct"
                      type="number"
                      step="0.01"
                      class="input w-28 shrink-0 text-sm"
                      title="Tolerance (e.g. 0.25 = 25%) above your max salary still counts as nearRange"
                    >
                    <span class="text-[11px] text-neutral-body truncate" title="Tolerance (e.g. 0.25 = 25%) above your max salary still counts as nearRange">overPayTolerancePct</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.thresholds!.underPayTolerancePct"
                      type="number"
                      step="0.01"
                      class="input w-28 shrink-0 text-sm"
                      title="Tolerance (e.g. 0.15 = 15%) below your min salary still counts as nearRange"
                    >
                    <span class="text-[11px] text-neutral-body truncate" title="Tolerance (e.g. 0.15 = 15%) below your min salary still counts as nearRange">underPayTolerancePct</span>
                  </div>
                </div>
              </div>

              <div class="space-y-2 bg-white rounded-lg shadow-sm px-3 py-2.5">
                <p class="text-xs font-semibold text-neutral-body">Location - Distance</p>
                <div class="space-y-1.5">
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.locationWeights!.distance0to10"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Distance-based mode: score added when the closest preferred location is within 0–10 miles"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Distance-based mode: score added when the closest preferred location is within 0–10 miles"
                    >distance0to10</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.locationWeights!.distance10to25"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Distance-based mode: score added when the closest preferred location is within 10–25 miles"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Distance-based mode: score added when the closest preferred location is within 10–25 miles"
                    >distance10to25</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.locationWeights!.distance25to50"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Distance-based mode: score added when the closest preferred location is within 25–50 miles"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Distance-based mode: score added when the closest preferred location is within 25–50 miles"
                    >distance25to50</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.locationWeights!.distance50to100"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Distance-based mode: score added when the closest preferred location is within 50–100 miles"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Distance-based mode: score added when the closest preferred location is within 50–100 miles"
                    >distance50to100</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.locationWeights!.distanceBeyond100"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Distance-based mode: score added when the closest preferred location is more than 100 miles away"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Distance-based mode: score added when the closest preferred location is more than 100 miles away"
                    >distanceBeyond100</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.locationWeights!.withinRadiusBonus"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Extra distance-based bonus when the closest preferred location is within the user-selected radius (added on top of the distance band)"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Extra distance-based bonus when the closest preferred location is within the user-selected radius (added on top of the distance band)"
                    >withinRadiusBonus</span>
                  </div>
                </div>
              </div>

              <div class="space-y-2 bg-white rounded-lg shadow-sm px-3 py-2.5">
                <p class="text-xs font-semibold text-neutral-body">Location - Categorical (Fallback)</p>
                <div class="space-y-1.5">
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.locationWeights!.sameMetro"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Applied only when distance-based scoring is not used and the job location string matches a preferred location (metro-level match)"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Applied only when distance-based scoring is not used and the job location string matches a preferred location (metro-level match)"
                    >sameMetro</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.locationWeights!.sameState"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Applied only when distance-based scoring is not used and the job is in the same state/region as a preferred location"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Applied only when distance-based scoring is not used and the job is in the same state/region as a preferred location"
                    >sameState</span>
                  </div>
                </div>
              </div>

              <div class="space-y-2 bg-white rounded-lg shadow-sm px-3 py-2.5">
                <p class="text-xs font-semibold text-neutral-body">Location - Shared</p>
                <div class="space-y-1.5">
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.locationWeights!.remotePreferred"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Always applied when job is remote and you are open to remote (in both categorical and distance-based modes)"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Always applied when job is remote and you are open to remote (in both categorical and distance-based modes)"
                    >remotePreferred</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.locationWeights!.relocationAllowed"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Applied when job is outside preferred locations and far away but you are open to relocation"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Applied when job is outside preferred locations and far away but you are open to relocation"
                    >relocationAllowed</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="configForm.locationWeights!.otherLocationPenalty"
                      type="number"
                      class="input w-28 shrink-0 text-sm"
                      title="Penalty when job is in a non-preferred location, far away, and you are not open to relocation"
                    >
                    <span
                      class="text-[11px] text-neutral-body truncate"
                      title="Penalty when job is in a non-preferred location, far away, and you are not open to relocation"
                    >otherLocationPenalty</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            class="btn-primary"
            :disabled="isLoading || isApplyingMatchSubject"
            @click="loadMatches"
          >
            <span v-if="isLoading">Running…</span>
            <span v-else>Run matching</span>
          </button>
          <button
            type="button"
            class="btn-secondary"
            :disabled="isLoading || isApplyingMatchSubject"
            @click="resetToDefaults"
          >
            Reset to defaults
          </button>
        </div>
      </div>

      <!-- Error state -->
      <div v-if="errorMessage" class="card border border-red-300 bg-red-50 p-4 sm:p-6">
        <h2 class="text-lg font-heading font-semibold text-red-800 mb-2">
          Error invoking job-matching function
        </h2>
        <p class="text-sm text-red-800 whitespace-pre-line">
          {{ errorMessage }}
        </p>
      </div>

      <!-- Summary & debug (filters, scores, keywords only) -->
      <div v-if="result" class="card p-4 sm:p-6 space-y-2">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Match summary
        </h2>
        <p class="text-sm text-neutral-body">
          <span class="font-semibold">Profile:</span>
          <code>{{ result.profile_id }}</code>
        </p>
        <p class="text-sm text-neutral-body">
          <span class="font-semibold">Matched jobs:</span>
          {{ result.total }}
          <span v-if="result.total > 0">(showing {{ pageRangeLabel }} of {{ result.total }})</span>
        </p>
        <div v-if="debug" class="mt-4 grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <h3 class="text-sm font-heading font-semibold text-brand-charcoal">
              Filters
            </h3>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Jobs fetched:</span>
              <span>{{ debug.filters.totalJobs }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">After filters:</span>
              <span>{{ debug.filters.includedAfterFilters }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by subscription tier:</span>
              <span>{{ debug.filters.excludedBySubscriptionTier ?? 0 }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by role:</span>
              <span>{{ debug.filters.excludedByRole }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by remote opt-out:</span>
              <span>{{ debug.filters.excludedByRemoteOptOut }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by location:</span>
              <span>{{ debug.filters.excludedByLocation }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by recency:</span>
              <span>{{ debug.filters.excludedByRecency }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by phrase gate / no match:</span>
              <span>{{ debug.filters.excludedByNoKeywordMatch }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by minTotalScore:</span>
              <span>{{ debug.filters.excludedByMinTotalScore }}</span>
            </p>
            <p class="text-[11px] text-neutral-subtle mt-2">
              “Excluded by location” is reserved for future use; location is scored, not a hard filter in the current implementation.
            </p>
          </div>

          <div class="space-y-2">
            <h3 class="text-sm font-heading font-semibold text-brand-charcoal">
              Score statistics & phrase histogram
            </h3>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Score range:</span>
              <span>
                <span v-if="debug.scores.minScore !== null">
                  {{ debug.scores.minScore.toFixed(2) }}
                  –
                  {{ debug.scores.maxScore?.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Max possible score:</span>
              <span>{{ debug.scores.maxPossibleScore ?? '—' }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average total score:</span>
              <span>
                <span v-if="debug.scores.averageScore !== null">
                  {{ debug.scores.averageScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average role score:</span>
              <span>
                <span v-if="debug.scores.averageRoleScore !== null">
                  {{ debug.scores.averageRoleScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average pay score:</span>
              <span>
                <span v-if="typeof debug.scores.averagePayScore === 'number'">
                  {{ debug.scores.averagePayScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average location score:</span>
              <span>
                <span v-if="debug.scores.averageLocationScore !== null">
                  {{ debug.scores.averageLocationScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Average recency score:</span>
              <span>
                <span v-if="debug.scores.averageRecencyScore !== null">
                  {{ debug.scores.averageRecencyScore.toFixed(2) }}
                </span>
                <span v-else>—</span>
              </span>
            </p>

            <div class="mt-2">
              <p class="text-xs font-semibold text-neutral-body mb-1">
                Phrase histogram (profile phrases × included jobs)
              </p>
              <p
                v-if="debug.matchSurfaces"
                class="text-[11px] text-neutral-body mb-1"
              >
                Included jobs with a match on surface — title: {{ debug.matchSurfaces.title }}, description:
                {{ debug.matchSurfaces.description }}, briefing: {{ debug.matchSurfaces.briefing }}
              </p>
              <ul class="text-[11px] text-neutral-body max-h-32 overflow-auto border border-neutral-border rounded-md p-2 bg-neutral-surface">
                <li v-if="!(debug.phrases && debug.phrases.length)">
                  None
                </li>
                <template v-else>
                  <li
                    v-for="row in debug.phrases"
                    :key="`${row.kind}-${row.phrase}`"
                    class="flex justify-between gap-2"
                  >
                    <span class="truncate"><span class="text-neutral-subtle">{{ row.kind }}</span> {{ row.phrase }}</span>
                    <span class="font-mono text-[10px]">
                      {{ row.matchedJobCount }}
                    </span>
                  </li>
                </template>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Jobs table (paginated) -->
      <div v-if="jobs.length" class="card p-0 overflow-hidden">
        <div class="px-3 py-2 border-b border-neutral-border bg-neutral-surface flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm text-neutral-body">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn-secondary text-sm py-1 px-2"
              :disabled="currentPage <= 1"
              @click="goToPage(currentPage - 1)"
            >
              Previous
            </button>
            <button
              type="button"
              class="btn-secondary text-sm py-1 px-2"
              :disabled="currentPage >= totalPages"
              @click="goToPage(currentPage + 1)"
            >
              Next
            </button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-neutral-border text-xs sm:text-sm">
            <thead class="bg-neutral-surface">
              <tr>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Score / % of max</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Title</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Company</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Location</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Sponsorship</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Location parsing</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Posted</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">
                  Role / Pay / Location / Recency
                </th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">
                  Phrase match
                </th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Details</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-border bg-white">
              <tr v-for="job in pagedJobs" :key="job.id" class="align-top">
                <td class="px-3 py-2 whitespace-nowrap font-mono text-xs">
                  {{ job.score.toFixed(2) }}
                  <span v-if="debug?.scores?.maxPossibleScore != null && debug.scores.maxPossibleScore > 0">
                    ({{ ((100 * job.score) / debug.scores.maxPossibleScore).toFixed(1) }}%)
                  </span>
                </td>
                <td class="px-3 py-2">
                  <div class="font-semibold text-brand-charcoal">
                    {{ job.title || '(no title)' }}
                  </div>
                  <div class="text-[10px] text-neutral-body">
                    #{{ job.id }}
                  </div>
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  {{ job.companyName || '—' }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  {{ job.location || '—' }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap">
                  <span
                    v-if="job.effectiveSponsorshipLikelihood"
                    class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                    :class="{
                      'bg-green-100 text-green-800': job.effectiveSponsorshipLikelihood === 'High',
                      'bg-amber-100 text-amber-800': job.effectiveSponsorshipLikelihood === 'Medium',
                      'bg-red-100 text-red-800': job.effectiveSponsorshipLikelihood === 'Low',
                    }"
                  >
                    {{ job.effectiveSponsorshipLikelihood }}
                  </span>
                  <span v-else class="text-neutral-body">—</span>
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  <span v-if="job.locationParsed === false">
                    Unparsed (categorical fallback)
                  </span>
                  <span v-else-if="job.locationParsed && job.locationDistanceMiles != null">
                    Distance
                    ({{ job.locationDistanceMiles.toFixed(1) }} mi
                    <span v-if="job.withinRadius">, within radius</span>
                    <span v-else>, outside radius</span>)
                  </span>
                  <span v-else-if="job.locationParsed">
                    Parsed (categorical only)
                  </span>
                  <span v-else>—</span>
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  <span :title="job.postedDate ? 'posted_date' : 'posted_date missing; showing created_at'">
                    {{ formatJobPostedDate(job) }}
                  </span>
                  <div
                    v-if="!job.postedDate"
                    class="text-[10px] text-neutral-subtle"
                  >
                    (created)
                  </div>
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  <div>Role: {{ job.components?.role ?? '—' }}</div>
                  <div>Pay: {{ job.components?.pay ?? '—' }}</div>
                  <div>Location: {{ job.components?.location ?? '—' }}</div>
                  <div>Recency: {{ job.components?.recency != null ? job.components.recency.toFixed(2) : '—' }}</div>
                </td>
                <td class="px-3 py-2 text-neutral-body text-[11px] max-w-xs">
                  {{ formatPhraseMatchCell(job) }}
                </td>
                <td class="px-3 py-2 text-neutral-body">
                  <details class="space-y-1 max-w-xs sm:max-w-md">
                    <summary class="cursor-pointer text-brand-primary underline">
                      View text fields
                    </summary>
                    <div v-if="job.description">
                      <div class="font-semibold text-xs mb-0.5">Description</div>
                      <p class="text-[11px] whitespace-pre-line">
                        {{ job.description }}
                      </p>
                    </div>
                    <div v-if="job.aiBriefing" class="mt-2">
                      <div class="font-semibold text-xs mb-0.5">Highlights</div>
                      <p class="text-[11px] whitespace-pre-line">
                        {{ job.aiBriefing }}
                      </p>
                    </div>
                    <div v-if="job.applyLink" class="mt-2">
                      <div class="font-semibold text-xs mb-0.5">Apply link</div>
                      <a
                        :href="job.applyLink"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-[11px] text-brand-primary underline break-all"
                      >
                        {{ job.applyLink }}
                      </a>
                    </div>
                  </details>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="!isLoading" class="card p-4 sm:p-6">
        <p class="text-sm text-neutral-body">
          No jobs matched for the current input.
        </p>
      </div>
    </div>
  </div>

  <!-- Config picker modal -->
  <div
    v-if="isConfigModalOpen"
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
  >
    <div class="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
      <div class="px-4 py-3 border-b border-neutral-border flex items-center justify-between">
        <h2 class="text-sm font-heading font-semibold text-brand-charcoal">
          Matching configs
        </h2>
        <button
          type="button"
          class="text-xs text-neutral-body hover:text-brand-charcoal"
          @click="isConfigModalOpen = false"
        >
          Close
        </button>
      </div>
      <div class="p-4 space-y-3 overflow-y-auto max-h-[60vh]">
        <p v-if="!configs.length" class="text-xs text-neutral-body">
          No saved configurations yet. Use “Save current as config…” to create one.
        </p>
        <ul v-else class="space-y-2">
          <li
            v-for="cfg in configs"
            :key="cfg.id"
            class="border border-neutral-border rounded-md p-3 flex flex-col gap-2"
          >
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-brand-charcoal">
                  {{ cfg.name }}
                  <span
                    v-if="cfg.active"
                    class="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                  >
                    Active
                  </span>
                </p>
                <p class="text-[11px] text-neutral-body">
                  Updated {{ new Date(cfg.updatedAt).toLocaleString() }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn-secondary text-[11px] py-1 px-2"
                  @click="applyConfigFromList(cfg)"
                >
                  Apply to form
                </button>
                <button
                  type="button"
                  class="btn-secondary text-[11px] py-1 px-2"
                  @click="handleOverrideClick(cfg)"
                >
                  Override with current values…
                </button>
                <button
                  v-if="cfg.active"
                  type="button"
                  class="btn-secondary text-[11px] py-1 px-2 opacity-50 cursor-not-allowed"
                  disabled
                  title="Cannot delete the active configuration"
                >
                  <font-awesome-icon :icon="['fas', 'trash']" class="mr-1" aria-hidden="true" />
                  Delete
                </button>
                <button
                  v-else
                  type="button"
                  class="btn-secondary text-[11px] py-1 px-2 text-red-700 border-red-200 hover:bg-red-50"
                  @click="openArchiveConfirm(cfg)"
                >
                  <font-awesome-icon :icon="['fas', 'trash']" class="mr-1" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Save config modal -->
  <div
    v-if="isSaveConfigModalOpen"
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
  >
    <div class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
      <div class="px-4 py-3 border-b border-neutral-border flex items-center justify-between">
        <h2 class="text-sm font-heading font-semibold text-brand-charcoal">
          Save current config
        </h2>
        <button
          type="button"
          class="text-xs text-neutral-body hover:text-brand-charcoal"
          @click="isSaveConfigModalOpen = false"
        >
          Close
        </button>
      </div>
      <div class="p-4 space-y-3">
        <div>
          <label class="block text-xs font-medium text-neutral-body mb-1">
            Configuration name
          </label>
          <input
            v-model="saveConfigName"
            type="text"
            class="input w-full"
            placeholder="e.g. Aggressive recent jobs"
          >
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="saveConfigMakeActive"
            type="checkbox"
            class="rounded border-neutral-border"
          >
          <span class="text-xs text-neutral-body">
            Make this the active configuration for the algorithm
          </span>
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn-secondary text-xs"
            @click="isSaveConfigModalOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary text-xs"
            @click="saveCurrentAsConfig"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Archive config confirmation modal -->
  <div
    v-if="isArchiveConfirmOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  >
    <div class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
      <div class="px-4 py-3 border-b border-neutral-border flex items-center justify-between">
        <h2 class="text-sm font-heading font-semibold text-brand-charcoal">
          Delete configuration?
        </h2>
        <button
          type="button"
          class="text-xs text-neutral-body hover:text-brand-charcoal"
          @click="isArchiveConfirmOpen = false"
        >
          Close
        </button>
      </div>
      <div class="p-4 space-y-3">
        <p class="text-xs text-neutral-body">
          <span class="font-semibold text-brand-charcoal">{{ configToArchive?.name }}</span>
          will be removed from this list. The row is kept in the database with
          <code class="font-mono text-[11px] bg-neutral-bg px-1 py-0.5 rounded">archived = true</code>
          and will not be used for matching.
        </p>
        <p
          v-if="configArchiveError"
          class="text-xs text-red-700"
        >
          {{ configArchiveError }}
        </p>
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn-secondary text-xs"
            :disabled="isArchivingConfig"
            @click="isArchiveConfirmOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary text-xs bg-red-600 hover:bg-red-700 border-red-700"
            :disabled="isArchivingConfig"
            @click="confirmArchiveConfig"
          >
            <font-awesome-icon
              v-if="isArchivingConfig"
              :icon="['fas', 'spinner']"
              spin
              class="mr-1"
              aria-hidden="true"
            />
            Delete configuration
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Scary override warning modal -->
  <div
    v-if="isOverrideWarningOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  >
    <div class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 border border-red-300">
      <div class="px-4 py-3 border-b border-red-200 bg-red-50 flex items-center justify-between">
        <h2 class="text-sm font-heading font-semibold text-red-800">
          Override active configuration?
        </h2>
      </div>
      <div class="p-4 space-y-3">
        <p class="text-xs text-red-900">
          You are about to change the <span class="font-semibold">active job-matching configuration</span>.
          This will immediately affect how the algorithm scores jobs for all users on subsequent runs.
          This action cannot be undone.
        </p>
        <p class="text-xs text-red-900">
          To confirm, type <code class="font-mono text-[11px] bg-red-50 px-1 py-0.5 rounded">OVERRIDE</code> below and click
          <span class="font-semibold">Override active configuration</span>.
        </p>
        <input
          v-model="overrideConfirmationText"
          type="text"
          class="input w-full border-red-300"
          placeholder="Type OVERRIDE to confirm"
        >
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn-secondary text-xs"
            @click="isOverrideWarningOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary text-xs bg-red-600 hover:bg-red-700 border-red-700"
            :disabled="overrideConfirmationText.trim().toUpperCase() !== 'OVERRIDE'"
            @click="confirmOverrideActiveConfig"
          >
            Override active configuration
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

