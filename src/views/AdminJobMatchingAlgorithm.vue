<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from 'vue'
import { profileAPI } from '@/lib/profile'
import { subscriptionAPI } from '@/lib/subscription'
import {
  jobMatchingAlgorithmAdminAPI,
  DEFAULT_ADMIN_MATCH_CONFIG,
  deepCloneConfig,
  normalizeMatchConfigForm,
  matchConfigFormToOverride,
  categoryWeightSum,
  phraseSurfaceWeightSum,
  type MatchJobsResponse,
  type RankedJob,
  type MatchJobsDebugPayload,
  type SubscriberPreferencesOverride,
  type MatchConfigOverride,
  type AdminMatchConfigForm,
  type AdminMatchingConfig,
  type OnboardedMatchingSubscriberRow,
  type SubscriberMatchingPreferencesPayload,
} from '@/lib/admin-job-matching-algorithm'
import type { Profile } from '@/types/database'
import PreferredLocationsInput from '@/components/PreferredLocationsInput.vue'
import AdminTuningHintIcon from '@/components/AdminTuningHintIcon.vue'

/** Short visible blurbs under section headers (always shown). */
const MATCH_SECTION_INTROS = {
  page:
    'Each job gets a 0–100 score from five parts (title fit, pay, location, freshness, filter matches). Hard gates drop bad fits before scoring.',
  preferences:
    'Simulates a subscriber: what they want, where they work, and which job tiers they can see.',
  matchConfig:
    'Weights and rules for scoring. Saved configs apply in production when marked active.',
  categoryMix:
    'Split 100% across the five score parts. Higher % = that part can move the total more.',
  filterMatches:
    'Subscriber filters scored here (not hard gates). Today: target role category match (1.0 or 0.0).',
  hardGates:
    'On/off filters applied before scoring. Failed gates remove the job entirely.',
  phrase:
    'Sub-span phrases from each title segment plus title-only discriminating words (e.g. pricing on Associate Pricing Analyst).',
  pay: 'How pay compares to the subscriber range (missing salary uses its own score).',
  location:
    'Inside the subscriber’s radius → full score. Outside → band weights by miles past that radius (or by absolute miles if no radius set).',
  recency: 'How new the posting is; very old jobs can be dropped entirely.',
} as const

/** Hover hints — keep short; section intros carry the big picture. */
const MATCH_TUNING_TOOLTIPS = {
  pageOverview: MATCH_SECTION_INTROS.page,
  sectionPreferences: MATCH_SECTION_INTROS.preferences,
  sectionMatchConfig: MATCH_SECTION_INTROS.matchConfig,
  sectionCategoryMix: MATCH_SECTION_INTROS.categoryMix,
  sectionHardGates: MATCH_SECTION_INTROS.hardGates,
  sectionPhrase: MATCH_SECTION_INTROS.phrase,
  sectionPay: MATCH_SECTION_INTROS.pay,
  sectionLocation: MATCH_SECTION_INTROS.location,
  sectionRecency: MATCH_SECTION_INTROS.recency,
  matchSubject: 'Test as this user’s preferences and subscription tier. Empty = your admin profile.',
  subscriptionTier:
    'Product keys the subscriber’s plan allows. Jobs must match one key. Empty = live keys from their subscription.',
  roles:
    'Target role categories; scored in Filter Matches (not a hard gate). Leave empty for neutral filter score.',
  targetJobTitle: 'Comma-separated job-title phrases to match (main signal for “right role”).',
  currentJobTitle: 'Used only when target job title is empty.',
  currentIndustry: 'Industry keywords; matched separately from title phrases.',
  payRangeMin: 'Low end of desired annual pay (jobs convert hourly/monthly/etc. to yearly first).',
  payRangeMax: 'High end of desired annual pay.',
  locationRadiusMiles:
    'Jobs within this many miles of a preferred place get full location score (1.0). Band weights below apply only beyond this distance.',
  preferredLocations: 'Cities, states, or ZIPs used for distance and relocation rules.',
  openToRelocation: 'If off, very distant on-site jobs may be removed when the relocation gate is on.',
  openToRemote: 'If off, remote jobs are dropped. If on, remote can score full location points.',
  categoryPhrase: 'Title/industry keyword fit.',
  categoryPay: 'Salary vs desired range.',
  categoryLocation: 'Distance, remote, metro/state.',
  categoryRecency: 'How recently the job was posted.',
  categoryFilterMatches: 'Target role category and future subscriber filters.',
  sectionFilterMatches: MATCH_SECTION_INTROS.filterMatches,
  minTotalScore: 'Cutoff after scoring; jobs below this are hidden (default 40).',
  phraseGate:
    'Requires primary or industry match, or a discriminating word on the job title (not description-only).',
  payHardFloorEnabled: 'Drop jobs paid far below the subscriber’s minimum.',
  payHardFloorFraction: 'How far below min salary still counts as “far” (e.g. 0.3 = 30% under).',
  relocationGate: 'Drop distant on-site jobs when the subscriber won’t relocate.',
  tierPrimary: 'Strength when target title phrases match.',
  tierIndustry: 'Strength when industry keywords match.',
  tierSecondary:
    'Strength for discriminating (title-only) phrase matches.',
  surfaceTitle: 'How much the job title counts in phrase score.',
  surfaceDescription: 'How much the job description counts.',
  surfaceBriefing: 'How much the AI briefing counts.',
  payMissingSalary: 'Score when the listing has no salary (0–1).',
  payNearRange: 'Score when pay is a little below range.',
  payAboveRange: 'Score when pay is a little above range.',
  payOverTolerance: 'How far above max still counts as “a little above”.',
  payUnderTolerance: 'How far below min still counts as “a little below”.',
  loc0to10: 'Score when 0–10 miles past the subscriber’s radius.',
  loc10to25: 'Score when 10–25 miles past the radius.',
  loc25to50: 'Score when 25–50 miles past the radius.',
  loc50to100: 'Score when 50–100 miles past the radius.',
  locBeyond100: 'Score when more than 100 miles past the radius (relocation gate may drop earlier).',
  locSameMetro: 'Score when only city/metro text matches (no coordinates).',
  locSameState: 'Score when only state matches.',
  locRemoteAsPerfect: 'Remote jobs get full location points when subscriber allows remote.',
  recencyMaxAgeDays: 'Max job age in days; older jobs are excluded and newer ones score higher.',
} as const

const categoryWeightFields: {
  key: 'phrase' | 'pay' | 'location' | 'recency' | 'filterMatches'
  label: string
  tooltip: string
}[] = [
  { key: 'phrase', label: 'Phrase', tooltip: MATCH_TUNING_TOOLTIPS.categoryPhrase },
  { key: 'pay', label: 'Pay', tooltip: MATCH_TUNING_TOOLTIPS.categoryPay },
  { key: 'location', label: 'Location', tooltip: MATCH_TUNING_TOOLTIPS.categoryLocation },
  { key: 'recency', label: 'Recency', tooltip: MATCH_TUNING_TOOLTIPS.categoryRecency },
  {
    key: 'filterMatches',
    label: 'Filter Matches',
    tooltip: MATCH_TUNING_TOOLTIPS.categoryFilterMatches,
  },
]

type PhraseTierKey = 'primary' | 'industry' | 'secondary'
type PhraseSurfaceKey = 'title' | 'description' | 'briefing'

const phraseTierFields: { key: PhraseTierKey; label: string; tooltip: string }[] = [
  { key: 'primary', label: 'Primary', tooltip: MATCH_TUNING_TOOLTIPS.tierPrimary },
  { key: 'industry', label: 'Industry', tooltip: MATCH_TUNING_TOOLTIPS.tierIndustry },
  { key: 'secondary', label: 'Secondary', tooltip: MATCH_TUNING_TOOLTIPS.tierSecondary },
]

const phraseSurfaceFields: { key: PhraseSurfaceKey; label: string; tooltip: string }[] = [
  { key: 'title', label: 'Title wt', tooltip: MATCH_TUNING_TOOLTIPS.surfaceTitle },
  { key: 'description', label: 'Desc wt', tooltip: MATCH_TUNING_TOOLTIPS.surfaceDescription },
  { key: 'briefing', label: 'Brief wt', tooltip: MATCH_TUNING_TOOLTIPS.surfaceBriefing },
]

const payQualityFields: {
  label: string
  tooltip: string
  modelKey:
    | 'missingSalaryQuality'
    | 'nearRangeQuality'
    | 'aboveRangeQuality'
    | 'overToleranceFraction'
    | 'underToleranceFraction'
}[] = [
  { label: 'missingSalary', modelKey: 'missingSalaryQuality', tooltip: MATCH_TUNING_TOOLTIPS.payMissingSalary },
  { label: 'nearRange', modelKey: 'nearRangeQuality', tooltip: MATCH_TUNING_TOOLTIPS.payNearRange },
  { label: 'aboveRange', modelKey: 'aboveRangeQuality', tooltip: MATCH_TUNING_TOOLTIPS.payAboveRange },
  { label: 'overTol', modelKey: 'overToleranceFraction', tooltip: MATCH_TUNING_TOOLTIPS.payOverTolerance },
  { label: 'underTol', modelKey: 'underToleranceFraction', tooltip: MATCH_TUNING_TOOLTIPS.payUnderTolerance },
]

const locationBandFields: {
  label: string
  modelKey: 'd0to10' | 'd10to25' | 'd25to50' | 'd50to100' | 'dBeyond100'
  tooltip: string
}[] = [
  { label: '0–10 mi past range', modelKey: 'd0to10', tooltip: MATCH_TUNING_TOOLTIPS.loc0to10 },
  { label: '10–25 past', modelKey: 'd10to25', tooltip: MATCH_TUNING_TOOLTIPS.loc10to25 },
  { label: '25–50 past', modelKey: 'd25to50', tooltip: MATCH_TUNING_TOOLTIPS.loc25to50 },
  { label: '50–100 past', modelKey: 'd50to100', tooltip: MATCH_TUNING_TOOLTIPS.loc50to100 },
  { label: '100+ past', modelKey: 'dBeyond100', tooltip: MATCH_TUNING_TOOLTIPS.locBeyond100 },
]

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

const configForm = reactive<AdminMatchConfigForm>(deepCloneConfig(DEFAULT_ADMIN_MATCH_CONFIG))

const categoryWeightSumPct = computed(() => Math.round(categoryWeightSum(configForm) * 100))
const phraseSurfaceWeightSumPct = computed(() =>
  Math.round(phraseSurfaceWeightSum(configForm) * 100),
)
const categoryWeightsValid = computed(() => Math.abs(categoryWeightSum(configForm) - 1) <= 0.02)
const phraseSurfaceWeightsValid = computed(
  () => Math.abs(phraseSurfaceWeightSum(configForm) - 1) <= 0.02,
)

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

function buildMatchConfigOverride(): MatchConfigOverride {
  return matchConfigFormToOverride(configForm)
}

async function resetToDefaults() {
  suppressMatchSubjectWatch.value = true
  matchSubjectProfileId.value = ''
  await loadAdminPreferencesOnly()
  suppressMatchSubjectWatch.value = false
  const src = activeConfig.value?.config
  Object.assign(configForm, deepCloneConfig(normalizeMatchConfigForm(src)))
}

function applyConfigToForm(cfg: MatchConfigOverride | undefined) {
  Object.assign(configForm, deepCloneConfig(normalizeMatchConfigForm(cfg)))
}

function setCategoryWeightPct(
  key: 'phrase' | 'pay' | 'location' | 'recency' | 'filterMatches',
  pct: number,
) {
  configForm.categoryWeights[key] = Math.max(0, Math.min(100, pct)) / 100
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

  try {
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
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to run matching'
    result.value = null
  } finally {
    isLoading.value = false
  }
}

function formatScorePoints(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toFixed(1)
}

function formatQualityPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(0)}%`
}

function formatJobPostedDate(job: RankedJob): string {
  const iso = job.postedDate ?? job.createdAt
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatJobPay(job: RankedJob): string {
  const { payMin, payMax, payType } = job
  if (payMin == null && payMax == null) return '—'
  const type = payType ?? 'year'
  const suffix =
    type === 'hour' || type === 'hourly'
      ? '/hr'
      : type === 'month'
        ? '/mo'
        : type === 'week'
          ? '/wk'
          : '/yr'
  const fmt = (n: number) =>
    type === 'year' ? `$${Math.round(n / 1000)}k` : `$${n.toLocaleString()}`
  if (payMin != null && payMax != null) return `${fmt(payMin)}–${fmt(payMax)}${suffix}`
  if (payMin != null) return `${fmt(payMin)}+${suffix}`
  if (payMax != null) return `≤${fmt(payMax)}${suffix}`
  return '—'
}

function formatPhraseMatchCell(job: RankedJob): string {
  const pm = job.phraseMatch
  if (!pm) return '—'
  const parts: string[] = []
  for (const tier of ['primary', 'discriminating', 'industry'] as const) {
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
          <AdminTuningHintIcon
            class="inline-block align-middle ml-1"
            :tooltip="MATCH_TUNING_TOOLTIPS.pageOverview"
          />
        </p>
        <p class="text-xs text-neutral-body max-w-3xl mt-2">
          {{ MATCH_SECTION_INTROS.page }}
        </p>
      </header>

      <!-- Preferences & config form -->
      <div class="card p-4 sm:p-6 space-y-6">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal">
          Algorithm input
        </h2>
        <p class="text-xs text-neutral-body max-w-3xl -mt-4">
          Set who you are matching as, their preferences, then adjust scoring weights and gates.
        </p>

        <div
          class="rounded-xl border border-neutral-border/80 bg-neutral-bg/80 px-3 py-3 sm:px-4 sm:py-4 space-y-2"
          :title="MATCH_TUNING_TOOLTIPS.matchSubject"
        >
          <label
            class="block text-xs font-medium text-neutral-body"
            for="admin-match-subject"
            :title="MATCH_TUNING_TOOLTIPS.matchSubject"
          >
            <span class="inline-flex items-center gap-1">
              <span>Match as subscriber</span>
              <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.matchSubject" />
            </span>
          </label>
          <select
            id="admin-match-subject"
            v-model="matchSubjectProfileId"
            class="input w-full text-sm"
            :title="MATCH_TUNING_TOOLTIPS.matchSubject"
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
          <div>
            <h3 class="text-sm font-heading font-semibold text-brand-charcoal inline-flex items-center gap-1">
              <span>Preferences</span>
              <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.sectionPreferences" />
            </h3>
            <p class="text-xs text-neutral-body mt-1">
              {{ MATCH_SECTION_INTROS.preferences }}
            </p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label
                class="block text-xs font-medium text-neutral-body mb-1"
                :title="MATCH_TUNING_TOOLTIPS.subscriptionTier"
              >
                <span class="inline-flex items-center gap-1 flex-wrap">
                  <span>
                    Subscription tier product keys (comma-separated, optional override)
                    <span v-if="basePlanProductKeyOptions.length" class="font-normal">
                      ({{ basePlanProductKeyOptions.join(', ') }})
                    </span>
                  </span>
                  <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.subscriptionTier" />
                </span>
              </label>
              <input
                v-model="prefsForm.subscriptionTierProductKeys"
                type="text"
                class="input w-full"
                :title="MATCH_TUNING_TOOLTIPS.subscriptionTier"
                :placeholder="subscriptionTierFieldPlaceholder"
              >
              <p class="text-xs text-neutral-body mt-1">
                Leave empty to use the subscriber’s live plan keys.
              </p>
            </div>
            <div>
              <label
                class="block text-xs font-medium text-neutral-body mb-1"
                :title="MATCH_TUNING_TOOLTIPS.roles"
              >
                <span class="inline-flex items-center gap-1 flex-wrap">
                  <span>
                    Target role categories (comma-separated; must match
                    <code class="text-[10px]">job_hopper_live.role_category</code> values)
                  </span>
                  <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.roles" />
                </span>
              </label>
              <input
                v-model="prefsForm.roles"
                type="text"
                class="input w-full"
                :title="MATCH_TUNING_TOOLTIPS.roles"
                placeholder="e.g. maintenance, engineering"
              >
            </div>
            <div>
              <label
                class="block text-xs font-medium text-neutral-body mb-1"
                :title="MATCH_TUNING_TOOLTIPS.targetJobTitle"
              >
                <span class="inline-flex items-center gap-1">
                  <span>Target job title (comma-separated keyword phrases)</span>
                  <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.targetJobTitle" />
                </span>
              </label>
              <input
                v-model="prefsForm.targetJobTitle"
                type="text"
                class="input w-full"
                :title="MATCH_TUNING_TOOLTIPS.targetJobTitle"
                placeholder="e.g. welder, plant manager"
              >
              <p class="text-[11px] text-neutral-body mt-1">
                If empty, title keywords fall back to current job title.
              </p>
            </div>
            <div>
              <label
                class="block text-xs font-medium text-neutral-body mb-1"
                :title="MATCH_TUNING_TOOLTIPS.currentJobTitle"
              >
                <span class="inline-flex items-center gap-1">
                  <span>Current job title (fallback for title keywords)</span>
                </span>
              </label>
              <input
                v-model="prefsForm.currentJobTitle"
                type="text"
                class="input w-full"
                :title="MATCH_TUNING_TOOLTIPS.currentJobTitle"
                placeholder="Used when target job title is empty"
              >
            </div>
            <div>
              <label
                class="block text-xs font-medium text-neutral-body mb-1"
                :title="MATCH_TUNING_TOOLTIPS.currentIndustry"
              >
                <span class="inline-flex items-center gap-1">
                  <span>Current industry (comma-separated keywords)</span>
                </span>
              </label>
              <input
                v-model="prefsForm.currentIndustry"
                type="text"
                class="input w-full"
                :title="MATCH_TUNING_TOOLTIPS.currentIndustry"
                placeholder="e.g. Tech, Finance"
              >
            </div>
            <div>
              <label
                class="block text-xs font-medium text-neutral-body mb-1"
                :title="MATCH_TUNING_TOOLTIPS.payRangeMin"
              >
                <span class="inline-flex items-center gap-1">
                  <span>Desired salary min (annual)</span>
                  <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.payRangeMin" />
                </span>
              </label>
              <input
                v-model="prefsForm.payRangeMin"
                type="number"
                class="input w-full"
                :title="MATCH_TUNING_TOOLTIPS.payRangeMin"
                placeholder="e.g. 80000"
              >
              <p class="text-[11px] text-neutral-body mt-1">
                Hourly and monthly listings are converted to yearly before comparing.
              </p>
            </div>
            <div>
              <label
                class="block text-xs font-medium text-neutral-body mb-1"
                :title="MATCH_TUNING_TOOLTIPS.payRangeMax"
              >
                <span class="inline-flex items-center gap-1">
                  <span>Desired salary max (annual)</span>
                </span>
              </label>
              <input
                v-model="prefsForm.payRangeMax"
                type="number"
                class="input w-full"
                :title="MATCH_TUNING_TOOLTIPS.payRangeMax"
                placeholder="e.g. 80000"
              >
            </div>
            <div>
              <label
                class="block text-xs font-medium text-neutral-body mb-1"
                :title="MATCH_TUNING_TOOLTIPS.locationRadiusMiles"
              >
                <span class="inline-flex items-center gap-1">
                  <span>Location radius (miles)</span>
                </span>
              </label>
              <input
                v-model="prefsForm.locationRadiusMiles"
                type="number"
                min="0"
                class="input w-full"
                :title="MATCH_TUNING_TOOLTIPS.locationRadiusMiles"
                placeholder="e.g. 25"
              >
            </div>
            <div>
              <PreferredLocationsInput
                v-model="prefsForm.preferredLocations"
                label="Preferred locations"
                input-id="admin-preferred-locations"
                :tooltip="MATCH_TUNING_TOOLTIPS.preferredLocations"
              />
            </div>
            <div class="flex items-center gap-4">
              <label
                class="flex items-center gap-2 cursor-pointer"
                :title="MATCH_TUNING_TOOLTIPS.openToRelocation"
              >
                <input
                  v-model="prefsForm.openToRelocation"
                  type="checkbox"
                  class="rounded border-neutral-border"
                  :title="MATCH_TUNING_TOOLTIPS.openToRelocation"
                >
                <span class="text-sm text-neutral-body" :title="MATCH_TUNING_TOOLTIPS.openToRelocation">
                  Open to relocation
                </span>
              </label>
              <label
                class="flex items-center gap-2 cursor-pointer"
                :title="MATCH_TUNING_TOOLTIPS.openToRemote"
              >
                <input
                  v-model="prefsForm.openToRemote"
                  type="checkbox"
                  class="rounded border-neutral-border"
                  :title="MATCH_TUNING_TOOLTIPS.openToRemote"
                >
                <span class="text-sm text-neutral-body" :title="MATCH_TUNING_TOOLTIPS.openToRemote">
                  Open to remote
                </span>
              </label>
            </div>
          </div>
        </section>

        <section class="space-y-3 border-t border-neutral-border pt-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-heading font-semibold text-brand-charcoal inline-flex items-center gap-1">
                <span>Match config</span>
                <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.sectionMatchConfig" />
              </h3>
              <p class="text-xs text-neutral-body mt-1">
                {{ MATCH_SECTION_INTROS.matchConfig }}
              </p>
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
          <div class="rounded-2xl border border-neutral-border/70 bg-neutral-bg px-3 py-3 sm:px-4 sm:py-4 space-y-4">
            <div class="bg-white rounded-lg shadow-sm px-3 py-3 space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="text-xs font-semibold text-neutral-body inline-flex items-center gap-1">
                    <span>Category mix (0–100 total)</span>
                    <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.sectionCategoryMix" />
                  </p>
                  <p class="text-[11px] text-neutral-body mt-0.5">
                    {{ MATCH_SECTION_INTROS.categoryMix }}
                  </p>
                </div>
                <span
                  class="text-[11px] font-mono"
                  :class="categoryWeightsValid ? 'text-green-700' : 'text-red-700'"
                >
                  Sum: {{ categoryWeightSumPct }}% (must be 100%)
                </span>
              </div>
              <label
                v-for="field in categoryWeightFields"
                :key="field.key"
                class="block text-[11px] text-neutral-body"
                :title="field.tooltip"
              >
                <span class="inline-flex items-center gap-1">
                  <span>
                    {{ field.label }}
                    {{ Math.round((configForm.categoryWeights?.[field.key] ?? 0) * 100) }}%
                  </span>
                  <AdminTuningHintIcon :tooltip="field.tooltip" />
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  class="w-full"
                  :title="field.tooltip"
                  :value="Math.round((configForm.categoryWeights?.[field.key] ?? 0) * 100)"
                  @input="setCategoryWeightPct(field.key, Number(($event.target as HTMLInputElement).value))"
                >
              </label>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div
                class="bg-white rounded-lg shadow-sm px-3 py-3 space-y-2"
                :title="MATCH_TUNING_TOOLTIPS.minTotalScore"
              >
                <p class="text-xs font-semibold text-neutral-body inline-flex items-center gap-1">
                  <span>Minimum score (0–100)</span>
                  <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.minTotalScore" />
                </p>
                <input
                  v-model.number="configForm.thresholds.minTotalScore"
                  type="range"
                  min="0"
                  max="100"
                  class="w-full"
                  :title="MATCH_TUNING_TOOLTIPS.minTotalScore"
                >
                <p class="text-[11px] text-neutral-body font-mono">
                  Include jobs with score ≥ {{ configForm.thresholds?.minTotalScore ?? 0 }}
                </p>
              </div>
              <div class="bg-white rounded-lg shadow-sm px-3 py-3 space-y-2">
                <div>
                  <p class="text-xs font-semibold text-neutral-body inline-flex items-center gap-1">
                    <span>Hard gates</span>
                    <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.sectionHardGates" />
                  </p>
                  <p class="text-[11px] text-neutral-body mt-0.5">
                    {{ MATCH_SECTION_INTROS.hardGates }}
                  </p>
                </div>
                <label
                  class="flex items-center gap-2 text-[11px] text-neutral-body cursor-pointer"
                  :title="MATCH_TUNING_TOOLTIPS.phraseGate"
                >
                  <input
                    v-model="configForm.phraseGate.requirePrimaryOrIndustry"
                    type="checkbox"
                    class="rounded border-neutral-border"
                    :title="MATCH_TUNING_TOOLTIPS.phraseGate"
                  >
                  <span class="inline-flex items-center gap-1">
                    <span>Require primary or industry phrase match</span>
                    <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.phraseGate" />
                  </span>
                </label>
                <label
                  class="flex items-center gap-2 text-[11px] text-neutral-body cursor-pointer"
                  :title="MATCH_TUNING_TOOLTIPS.payHardFloorEnabled"
                >
                  <input
                    v-model="configForm.pay.hardFloorEnabled"
                    type="checkbox"
                    class="rounded border-neutral-border"
                    :title="MATCH_TUNING_TOOLTIPS.payHardFloorEnabled"
                  >
                  <span class="inline-flex items-center gap-1">
                    <span>Exclude pay far below range</span>
                    <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.payHardFloorEnabled" />
                  </span>
                </label>
                <div
                  v-if="configForm.pay?.hardFloorEnabled"
                  class="flex items-center gap-2"
                  :title="MATCH_TUNING_TOOLTIPS.payHardFloorFraction"
                >
                  <input
                    v-model.number="configForm.pay.hardFloorFraction"
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    class="input w-28 shrink-0 text-sm"
                    :title="MATCH_TUNING_TOOLTIPS.payHardFloorFraction"
                  >
                  <span
                    class="text-[11px] text-neutral-body"
                    :title="MATCH_TUNING_TOOLTIPS.payHardFloorFraction"
                  >
                    Below-min cutoff (fraction)
                  </span>
                </div>
                <label
                  class="flex items-center gap-2 text-[11px] text-neutral-body cursor-pointer"
                  :title="MATCH_TUNING_TOOLTIPS.relocationGate"
                >
                  <input
                    v-model="configForm.location.relocationGateEnabled"
                    type="checkbox"
                    class="rounded border-neutral-border"
                    :title="MATCH_TUNING_TOOLTIPS.relocationGate"
                  >
                  <span class="inline-flex items-center gap-1">
                    <span>Exclude far jobs unless remote / relocation</span>
                    <AdminTuningHintIcon :tooltip="MATCH_TUNING_TOOLTIPS.relocationGate" />
                  </span>
                </label>
              </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm px-3 py-2">
              <div class="flex items-start gap-1.5 pt-2">
                <details class="min-w-0 flex-1">
                  <summary class="cursor-pointer text-xs font-semibold text-brand-charcoal list-none pb-2">
                    Phrase tuning
                  </summary>
                  <div class="pb-3 space-y-2 border-t border-neutral-border/60 pt-2">
                <p class="text-[11px] text-neutral-body">
                  {{ MATCH_SECTION_INTROS.phrase }}
                </p>
                <p
                  class="text-[11px]"
                  :class="phraseSurfaceWeightsValid ? 'text-neutral-body' : 'text-red-700'"
                >
                  Title / description / briefing weights must sum to 100% (now {{ phraseSurfaceWeightSumPct }}%).
                </p>
                <p class="text-[11px] text-neutral-subtle">
                  Match strength by tier; surface weights = how much title vs description vs briefing count.
                </p>
                <div class="grid gap-2 sm:grid-cols-3 text-[11px]">
                  <label
                    v-for="field in phraseTierFields"
                    :key="field.key"
                    class="flex items-center gap-2 cursor-pointer"
                    :title="field.tooltip"
                  >
                    <span class="shrink-0">{{ field.label }}</span>
                    <input
                      v-model.number="configForm.phrase.tierFactors[field.key]"
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      class="input w-20 text-sm"
                      :title="field.tooltip"
                    >
                  </label>
                  <label
                    v-for="field in phraseSurfaceFields"
                    :key="field.key"
                    class="flex items-center gap-2 cursor-pointer"
                    :title="field.tooltip"
                  >
                    <span class="shrink-0">{{ field.label }}</span>
                    <input
                      v-model.number="configForm.phrase.surfaceWeights[field.key]"
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      class="input w-20 text-sm"
                      :title="field.tooltip"
                    >
                  </label>
                </div>
                  </div>
                </details>
                <AdminTuningHintIcon
                  class="mt-0.5"
                  :tooltip="MATCH_TUNING_TOOLTIPS.sectionPhrase"
                />
              </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm px-3 py-2">
              <div class="flex items-start gap-1.5 pt-2">
                <details class="min-w-0 flex-1">
                  <summary class="cursor-pointer text-xs font-semibold text-brand-charcoal list-none pb-2">
                    Pay tuning (0–1 per situation)
                  </summary>
                  <div class="pb-3 grid gap-2 sm:grid-cols-2 text-[11px] border-t border-neutral-border/60 pt-2">
                <p class="sm:col-span-2 text-neutral-body">
                  {{ MATCH_SECTION_INTROS.pay }}
                </p>
                <label
                  v-for="field in payQualityFields"
                  :key="field.modelKey"
                  class="flex items-center gap-2 cursor-pointer"
                  :title="field.tooltip"
                >
                  <span class="shrink-0">{{ field.label }}</span>
                  <input
                    v-model.number="configForm.pay[field.modelKey]"
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    class="input w-20 text-sm"
                    :title="field.tooltip"
                  >
                </label>
                  </div>
                </details>
                <AdminTuningHintIcon class="mt-0.5" :tooltip="MATCH_TUNING_TOOLTIPS.sectionPay" />
              </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm px-3 py-2">
              <div class="flex items-start gap-1.5 pt-2">
                <details class="min-w-0 flex-1">
                  <summary class="cursor-pointer text-xs font-semibold text-brand-charcoal list-none pb-2">
                    Location tuning (in-range = 1.0; bands = past radius)
                  </summary>
                  <div class="pb-3 space-y-2 text-[11px] border-t border-neutral-border/60 pt-2">
                <p class="text-neutral-body">
                  {{ MATCH_SECTION_INTROS.location }}
                </p>
                <div class="grid gap-2 sm:grid-cols-2">
                  <label
                    v-for="field in locationBandFields"
                    :key="field.modelKey"
                    class="flex items-center gap-2 cursor-pointer"
                    :title="field.tooltip"
                  >
                    <span class="shrink-0">{{ field.label }}</span>
                    <input
                      v-model.number="configForm.location.bandQualities[field.modelKey]"
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      class="input w-20 text-sm"
                      :title="field.tooltip"
                    >
                  </label>
                  <label
                    class="flex items-center gap-2 cursor-pointer"
                    :title="MATCH_TUNING_TOOLTIPS.locSameMetro"
                  >
                    <span class="shrink-0">sameMetro</span>
                    <input
                      v-model.number="configForm.location.sameMetroQuality"
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      class="input w-20 text-sm"
                      :title="MATCH_TUNING_TOOLTIPS.locSameMetro"
                    >
                  </label>
                  <label
                    class="flex items-center gap-2 cursor-pointer"
                    :title="MATCH_TUNING_TOOLTIPS.locSameState"
                  >
                    <span class="shrink-0">sameState</span>
                    <input
                      v-model.number="configForm.location.sameStateQuality"
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      class="input w-20 text-sm"
                      :title="MATCH_TUNING_TOOLTIPS.locSameState"
                    >
                  </label>
                </div>
                <label
                  class="flex items-center gap-2 text-neutral-body cursor-pointer"
                  :title="MATCH_TUNING_TOOLTIPS.locRemoteAsPerfect"
                >
                  <input
                    v-model="configForm.location.remoteAsPerfect"
                    type="checkbox"
                    class="rounded border-neutral-border"
                    :title="MATCH_TUNING_TOOLTIPS.locRemoteAsPerfect"
                  >
                  <span :title="MATCH_TUNING_TOOLTIPS.locRemoteAsPerfect">
                    Count remote as full location score
                  </span>
                </label>
                  </div>
                </details>
                <AdminTuningHintIcon class="mt-0.5" :tooltip="MATCH_TUNING_TOOLTIPS.sectionLocation" />
              </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm px-3 py-2">
              <div class="flex items-start gap-1.5 pt-2">
                <details class="min-w-0 flex-1">
                  <summary class="cursor-pointer text-xs font-semibold text-brand-charcoal list-none pb-2">
                    Recency tuning
                  </summary>
                  <div class="pb-3 space-y-2 text-[11px] border-t border-neutral-border/60 pt-2">
                <p class="text-neutral-body">
                  {{ MATCH_SECTION_INTROS.recency }}
                </p>
                <div
                  class="flex items-center gap-2"
                  :title="MATCH_TUNING_TOOLTIPS.recencyMaxAgeDays"
                >
                  <input
                    v-model.number="configForm.recency.maxAgeDays"
                    type="number"
                    min="1"
                    class="input w-28 shrink-0 text-sm"
                    :title="MATCH_TUNING_TOOLTIPS.recencyMaxAgeDays"
                  >
                  <span class="text-neutral-body">maxAgeDays</span>
                </div>
                  </div>
                </details>
                <AdminTuningHintIcon class="mt-0.5" :tooltip="MATCH_TUNING_TOOLTIPS.sectionRecency" />
              </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm px-3 py-2">
              <div class="flex items-start gap-1.5 pt-2">
                <details class="min-w-0 flex-1">
                  <summary class="cursor-pointer text-xs font-semibold text-brand-charcoal list-none pb-2">
                    Filter Matches
                  </summary>
                  <div class="pb-3 space-y-2 text-[11px] border-t border-neutral-border/60 pt-2">
                    <p class="text-neutral-body">
                      {{ MATCH_SECTION_INTROS.filterMatches }}
                    </p>
                    <p class="text-neutral-subtle">
                      Role category is read from subscriber target roles (preferences above). More
                      filter signals will be added here later.
                    </p>
                  </div>
                </details>
                <AdminTuningHintIcon
                  class="mt-0.5"
                  :tooltip="MATCH_TUNING_TOOLTIPS.sectionFilterMatches"
                />
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
              <span class="font-semibold">Excluded by remote opt-out:</span>
              <span>{{ debug.filters.excludedByRemoteOptOut }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by recency:</span>
              <span>{{ debug.filters.excludedByRecency }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by phrase gate:</span>
              <span>{{ debug.filters.excludedByPhraseGate ?? 0 }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by pay hard floor:</span>
              <span>{{ debug.filters.excludedByPayHardFloor ?? 0 }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by relocation gate:</span>
              <span>{{ debug.filters.excludedByRelocationGate ?? 0 }}</span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Excluded by minTotalScore:</span>
              <span>{{ debug.filters.excludedByMinTotalScore }}</span>
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
              <span class="font-semibold">Avg phrase quality:</span>
              <span>
                <span v-if="debug.scores.averagePhraseQuality != null">
                  {{ (debug.scores.averagePhraseQuality * 100).toFixed(1) }}%
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Avg pay quality:</span>
              <span>
                <span v-if="debug.scores.averagePayQuality != null">
                  {{ (debug.scores.averagePayQuality * 100).toFixed(1) }}%
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Avg location quality:</span>
              <span>
                <span v-if="debug.scores.averageLocationQuality != null">
                  {{ (debug.scores.averageLocationQuality * 100).toFixed(1) }}%
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Avg recency quality:</span>
              <span>
                <span v-if="debug.scores.averageRecencyQuality != null">
                  {{ (debug.scores.averageRecencyQuality * 100).toFixed(1) }}%
                </span>
                <span v-else>—</span>
              </span>
            </p>
            <p class="text-xs text-neutral-body">
              <span class="font-semibold">Avg filter matches quality:</span>
              <span>
                <span v-if="debug.scores.averageFilterMatchesQuality != null">
                  {{ (debug.scores.averageFilterMatchesQuality * 100).toFixed(1) }}%
                </span>
                <span v-else>—</span>
              </span>
            </p>

            <div class="mt-2">
              <p class="text-xs font-semibold text-neutral-body mb-1">
                Phrase histogram (profile phrases × included jobs)
              </p>
              <p class="text-[10px] text-neutral-subtle mb-1">
                <span class="text-neutral-subtle">disc (title)</span> = title-only discriminating unigram (can pass gate)
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
                    <span class="truncate">
                      <span class="text-neutral-subtle">{{ row.kind === 'discriminating' ? 'disc (title)' : row.kind }}</span>
                      {{ row.phrase }}
                    </span>
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
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Score (0–100)</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Title</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Company</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Role</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Pay</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Location</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Sponsorship</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Location parsing</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Posted</th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">
                  Contributions
                </th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">
                  Phrase match
                </th>
                <th class="px-3 py-2 text-left font-semibold text-neutral-body">Details</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-border bg-white">
              <tr v-for="job in pagedJobs" :key="job.id" class="align-top">
                <td class="px-3 py-2 whitespace-nowrap font-mono text-xs font-semibold">
                  {{ job.score.toFixed(1) }}
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
                  {{ job.roleCategory || '—' }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body">
                  {{ formatJobPay(job) }}
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
                <td class="px-3 py-2 whitespace-nowrap text-neutral-body text-[11px]">
                  <template v-if="job.scoreContributions">
                    <div>Phrase: {{ formatScorePoints(job.scoreContributions.phrase) }}</div>
                    <div>Pay: {{ formatScorePoints(job.scoreContributions.pay) }}</div>
                    <div>Loc: {{ formatScorePoints(job.scoreContributions.location) }}</div>
                    <div>Rec: {{ formatScorePoints(job.scoreContributions.recency) }}</div>
                    <div>Filter: {{ formatScorePoints(job.scoreContributions.filterMatches) }}</div>
                  </template>
                  <template v-else-if="job.components">
                    <div>Phrase: {{ formatQualityPercent(job.components.phrase) }} q</div>
                    <div>Pay: {{ formatQualityPercent(job.components.pay) }} q</div>
                    <div>Loc: {{ formatQualityPercent(job.components.location) }} q</div>
                    <div>Rec: {{ formatQualityPercent(job.components.recency) }} q</div>
                    <div>Filter: {{ formatQualityPercent(job.components.filterMatches) }} q</div>
                  </template>
                  <span v-else>—</span>
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

