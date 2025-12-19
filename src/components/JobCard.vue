<script setup lang="ts">
import { useRouter } from 'vue-router'

const props = defineProps<{
  job: {
    id: string
    title: string
    company: string
    location: string
    salary_min?: number
    salary_max?: number
    brief?: string
    tags?: string[]
    status?: 'new' | 'updated' | 'closing_soon'
  }
}>()

const router = useRouter()

const formatSalary = () => {
  if (props.job.salary_min && props.job.salary_max) {
    return `$${props.job.salary_min.toLocaleString()} - $${props.job.salary_max.toLocaleString()}`
  }
  if (props.job.salary_min) {
    return `$${props.job.salary_min.toLocaleString()}+`
  }
  return 'Salary not specified'
}

const statusColors: Record<string, string> = {
  new: 'bg-green-100 text-green-800',
  updated: 'bg-blue-100 text-blue-800',
  closing_soon: 'bg-orange-100 text-orange-800'
}
</script>

<template>
  <div class="card p-6 hover:shadow-md transition-shadow">
    <div class="flex justify-between items-start mb-4">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <h3 class="text-xl font-heading font-semibold text-brand-charcoal">
            {{ job.title }}
          </h3>
          <span
            v-if="job.status"
            :class="['text-xs font-semibold px-2 py-1 rounded-full', statusColors[job.status]]"
          >
            {{ job.status === 'new' ? 'New' : job.status === 'updated' ? 'Updated' : 'Closing soon' }}
          </span>
        </div>
        <p class="text-brand-primary font-medium mb-1">{{ job.company }}</p>
        <p class="text-sm text-neutral-body">{{ job.location }}</p>
      </div>
      <div class="text-right">
        <p class="text-sm font-semibold text-brand-charcoal">{{ formatSalary() }}</p>
      </div>
    </div>

    <p v-if="job.brief" class="text-neutral-body mb-4 line-clamp-2">
      {{ job.brief }}
    </p>

    <div v-if="job.tags && job.tags.length > 0" class="flex flex-wrap gap-2 mb-4">
      <span
        v-for="tag in job.tags"
        :key="tag"
        class="text-xs px-2 py-1 bg-neutral-bg rounded-full text-neutral-body"
      >
        {{ tag }}
      </span>
    </div>

    <div class="flex gap-3">
      <button
        @click="router.push(`/job/${job.id}`)"
        class="btn-primary flex-1"
      >
        View details
      </button>
      <button class="btn-secondary">
        Apply on company site
      </button>
      <button class="p-3 border border-neutral-border rounded-[12px] hover:bg-neutral-bg">
        <svg class="w-5 h-5 text-neutral-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
        </svg>
      </button>
    </div>
  </div>
</template>

