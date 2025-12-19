<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { organizationAPI, userAPI } from '@/lib/supabase'

const organization = ref<any>(null)
const user = ref<any>(null)
const isLoading = ref(true)

onMounted(async () => {
  try {
    const [orgResult, userResult] = await Promise.all([
      organizationAPI.getCurrentOrganization(),
      userAPI.getCurrentUserProfile()
    ])
    
    if (!orgResult.error) {
      organization.value = orgResult.data
    }
    
    if (!userResult.error) {
      user.value = userResult.data
    }
  } catch (error) {
    console.error('Error loading dashboard data:', error)
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <div v-if="isLoading" class="text-center">
        <svg class="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-gray-600">Loading...</p>
      </div>

      <div v-else class="bg-white rounded-lg shadow-md p-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- User Info Card -->
          <div class="bg-blue-50 rounded-lg p-6">
            <h2 class="text-xl font-semibold text-gray-900 mb-4">User Information</h2>
            <div class="space-y-2">
              <p><span class="font-medium">Name:</span> {{ user?.first_name }} {{ user?.last_name }}</p>
              <p><span class="font-medium">Email:</span> {{ user?.email }}</p>
              <p v-if="user?.phone_number"><span class="font-medium">Phone:</span> {{ user?.phone_number }}</p>
              <p><span class="font-medium">Role:</span> {{ user?.role }}</p>
            </div>
          </div>

          <!-- Organization Info Card -->
          <div class="bg-green-50 rounded-lg p-6">
            <h2 class="text-xl font-semibold text-gray-900 mb-4">Organization Information</h2>
            <div class="space-y-2">
              <p><span class="font-medium">Name:</span> {{ organization?.name }}</p>
              <p v-if="organization?.domain"><span class="font-medium">Domain:</span> {{ organization.domain }}</p>
              <p><span class="font-medium">Onboarded:</span> {{ organization?.is_onboarded ? 'Yes' : 'No' }}</p>
            </div>
          </div>
        </div>

        <div class="mt-8 p-4 bg-gray-50 rounded-lg">
          <p class="text-sm text-gray-600">
            Welcome to your dashboard! This is a base template with authentication and organization management.
            You can extend this template to add your own features.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

