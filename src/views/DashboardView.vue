<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { userAPI, subscriptionAPI, type User, type JobFeedItem } from '@/lib/supabase'
import JobCard from '@/components/JobCard.vue'
import { getTierDisplayName, getStatusLabel, getActiveAddons, type Subscription } from '@/composables/useSubscription'
import { ROLE_CATEGORIES } from '@/composables/useRoleCategories'
import type { RoleCategoryValue } from '@/composables/useRoleCategories'

const user = ref<User | null>(null)
const subscription = ref<Subscription | null>(null)
const isLoading = ref(true)
const jobs = ref<JobFeedItem[]>([]) // Placeholder for job feed

// Filters
const selectedRoleTypes = ref<string[]>([])
const selectedLocation = ref('')
const salaryRange = ref([0, 200000])
const showSavedOnly = ref(false)

// Dynamic greeting
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
})

const userName = computed(() => {
  return user.value?.first_name || 'there'
})

const activeAddonsForDisplay = computed(() =>
  getActiveAddons(subscription.value).map((item) => item.label)
)

// Profile completion: key fields that improve matching
const profileCompletion = computed(() => {
  const u = user.value
  if (!u) return { filled: 0, total: 7, percent: 0 }
  const fields = [
    !!u.first_name?.trim(),
    !!u.last_name?.trim(),
    !!u.current_job_title?.trim(),
    (u.target_role_categories?.length ?? 0) > 0,
    (u.desired_salary_min != null || u.desired_salary_max != null) || (u.preferred_locations?.length ?? 0) > 0,
    u.years_of_experience != null,
    !!u.resume_bucket_key
  ]
  const filled = fields.filter(Boolean).length
  return { filled, total: fields.length, percent: Math.round((filled / fields.length) * 100) }
})

// Matching statistics (placeholder until API exists)
const matchingStats = ref({
  thisWeek: null as number | null,
  totalDelivered: null as number | null,
  avgMatchScore: null as number | null
})

function applyProfileToFilters(profile: User | null | undefined) {
  if (!profile) return
  const values = profile.target_role_categories ?? []
  if (values.length) selectedRoleTypes.value = values as RoleCategoryValue[]
  // Location: profile has preferred_locations array, use first or join
  const locations = profile.preferred_locations ?? []
  if (locations.length) selectedLocation.value = locations.join(', ')
  // Salary: profile has desired_salary_min / desired_salary_max
  const min = profile.desired_salary_min
  const max = profile.desired_salary_max
  if (min != null || max != null) {
    salaryRange.value = [
      min != null ? min : 0,
      max != null ? max : 200000
    ]
  }
}

onMounted(async () => {
  try {
    const [userResult, subscriptionResult] = await Promise.all([
      userAPI.getCurrentUserProfile(),
      subscriptionAPI.getCurrentSubscription()
    ])
    
    if (!userResult.error) {
      user.value = userResult.data
      applyProfileToFilters(userResult.data)
    }
    
    if (!subscriptionResult.error) {
      subscription.value = subscriptionResult.data
    }

    // TODO: Fetch actual jobs from API
    // For now, empty array shows "Hopper is warming up" state
  } catch (error) {
    console.error('Error loading dashboard data:', error)
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-heading font-bold text-brand-charcoal mb-2">
          {{ greeting }}, {{ userName }}
        </h1>
        <p class="text-neutral-body">
          Here are your latest job matches.
        </p>
        <p class="text-sm text-neutral-body mt-1">
          Your matches update as new opportunities hit the Hopper and as you refine your profile.
        </p>
      </div>

      <!-- Summary cards: Subscription, Add-ons, Profile completion, Matching stats -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <!-- Subscription status and tier -->
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Subscription</h3>
          <p class="font-heading font-semibold text-brand-charcoal">
            {{ getTierDisplayName(subscription?.subscription_tier) }}
          </p>
          <p class="text-sm text-neutral-body mt-1">
            {{ getStatusLabel(subscription?.subscription_status) }}
          </p>
          <p v-if="subscription?.subscription_status === 'trial' && subscription?.trial_ends_at" class="text-xs text-red-600 mt-2">
            Trial ends {{ new Date(subscription.trial_ends_at).toLocaleDateString() }}
          </p>
          <router-link to="/billing" class="text-sm text-brand-primary font-medium mt-2 inline-block hover:underline">
            Manage plan →
          </router-link>
        </div>

        <!-- Active add-ons -->
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Active add-ons</h3>
          <div v-if="activeAddonsForDisplay.length" class="space-y-1.5">
            <p v-for="label in activeAddonsForDisplay" :key="label" class="text-sm text-neutral-body">✓ {{ label }}</p>
          </div>
          <p v-else class="text-sm text-neutral-body">None</p>
          <router-link to="/billing" class="text-sm text-brand-primary font-medium mt-2 inline-block hover:underline">
            Add-ons →
          </router-link>
        </div>

        <!-- Profile completion status -->
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Profile completion</h3>
          <div class="flex items-center gap-3">
            <div class="flex-1 h-2.5 bg-neutral-bg rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="profileCompletion.percent === 100 ? 'bg-green-500' : profileCompletion.percent >= 50 ? 'bg-brand-primary' : 'bg-amber-500'"
                :style="{ width: `${profileCompletion.percent}%` }"
              />
            </div>
            <span class="text-sm font-semibold text-brand-charcoal tabular-nums">{{ profileCompletion.percent }}%</span>
          </div>
          <p class="text-xs text-neutral-body mt-2">{{ profileCompletion.filled }} of {{ profileCompletion.total }} key fields</p>
          <router-link to="/profile" class="text-sm text-brand-primary font-medium mt-2 inline-block hover:underline">
            Complete profile →
          </router-link>
        </div>

        <!-- Matching statistics -->
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-brand-charcoal uppercase tracking-wide mb-3">Matching statistics</h3>
          <div class="space-y-2 text-sm">
            <p class="text-neutral-body">
              <span class="font-medium text-brand-charcoal">This week:</span>
              {{ matchingStats.thisWeek != null ? matchingStats.thisWeek : '—' }}
            </p>
            <p class="text-neutral-body">
              <span class="font-medium text-brand-charcoal">Total delivered:</span>
              {{ matchingStats.totalDelivered != null ? matchingStats.totalDelivered : '—' }}
            </p>
            <p class="text-neutral-body">
              <span class="font-medium text-brand-charcoal">Avg. match score:</span>
              {{ matchingStats.avgMatchScore != null ? `${matchingStats.avgMatchScore}%` : '—' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Recent job matches -->
      <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-4">Recent job matches</h2>
      <div class="card p-6 mb-8">
        <h3 class="text-lg font-heading font-semibold text-brand-charcoal mb-4">Filters</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-brand-charcoal mb-2">Role type</label>
            <select v-model="selectedRoleTypes" multiple class="input">
              <option v-for="opt in ROLE_CATEGORIES" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-brand-charcoal mb-2">Location</label>
            <input
              v-model="selectedLocation"
              type="text"
              class="input"
              placeholder="City, State"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-brand-charcoal mb-2">Salary range</label>
            <div class="flex gap-2">
              <input
                v-model.number="salaryRange[0]"
                type="number"
                class="input"
                placeholder="Min"
              />
              <input
                v-model.number="salaryRange[1]"
                type="number"
                class="input"
                placeholder="Max"
              />
            </div>
          </div>
          <div class="flex items-end">
            <label class="flex items-center">
              <input
                v-model="showSavedOnly"
                type="checkbox"
                class="mr-2 w-4 h-4"
              />
              <span class="text-sm text-neutral-body">Show saved jobs only</span>
            </label>
          </div>
        </div>
        <p class="text-xs text-neutral-body mt-4">
          Use filters to broaden or narrow what you see. Your core preferences still guide your matches behind the scenes.
        </p>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="text-center py-12">
        <svg class="animate-spin h-8 w-8 text-brand-primary mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-neutral-body">Loading...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="jobs.length === 0" class="card p-12 text-center">
        <div class="max-w-md mx-auto">
          <div class="w-16 h-16 bg-gradient-to-r from-brand-rabbit-start to-brand-rabbit-end rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
          </div>
          <h2 class="text-2xl font-heading font-semibold text-brand-charcoal mb-2">
            Your Hopper is warming up.
          </h2>
          <p class="text-neutral-body mb-6">
            We're scanning new jobs now based on your profile. Check back soon, or loosen your filters to see a wider range of roles.
          </p>
          <router-link to="/profile" class="btn-primary inline-block">
            Review my preferences
          </router-link>
        </div>
      </div>

      <!-- Job Feed -->
      <div v-else class="grid grid-cols-1 gap-6">
        <JobCard
          v-for="job in jobs"
          :key="job.id"
          :job="job"
        />
      </div>
    </div>
  </div>
</template>
