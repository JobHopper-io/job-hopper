<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { userAPI, subscriptionAPI } from '@/lib/supabase'
import JobCard from '@/components/JobCard.vue'

const user = ref<any>(null)
const subscription = ref<any>(null)
const isLoading = ref(true)
const jobs = ref<any[]>([]) // Placeholder for job feed

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

onMounted(async () => {
  try {
    const [userResult, subscriptionResult] = await Promise.all([
      userAPI.getCurrentUserProfile(),
      subscriptionAPI.getCurrentSubscription()
    ])
    
    if (!userResult.error) {
      user.value = userResult.data
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

      <!-- Filters Panel -->
      <div class="card p-6 mb-8">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-4">Filters</h2>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-brand-charcoal mb-2">Role type</label>
            <select v-model="selectedRoleTypes" multiple class="input">
              <option value="operations">Operations / Production</option>
              <option value="maintenance">Maintenance / Technical</option>
              <option value="engineering">Engineering</option>
              <option value="management">Supervisory / Management</option>
              <option value="executive">Director / VP / Executive</option>
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
