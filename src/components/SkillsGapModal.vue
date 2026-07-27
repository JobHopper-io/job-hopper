<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/bodyScrollLock'
import type { SkillsGapResult } from '@/lib/skillsGap'

const props = defineProps<{
  open: boolean
  loading: boolean
  result: SkillsGapResult | null
  errorMessage: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function onBackdropClick() {
  emit('close')
}

/** No course-catalog API is wired up, and letting the LLM name specific courses/URLs risks
 * hallucinated links - so each topic links to a search instead of a claimed specific course. */
function courseSearchUrl(topic: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${topic} course`)}`
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && props.open) emit('close')
}

watch(
  () => props.open,
  (isOpen) => {
    if (typeof document === 'undefined') return
    if (isOpen) lockBodyScroll()
    else unlockBodyScroll()
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (props.open) unlockBodyScroll()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skills-gap-modal-title"
      @click.self="onBackdropClick"
    >
      <div
        class="card max-h-[min(85vh,36rem)] w-full max-w-lg overflow-hidden p-0 shadow-xl flex flex-col"
        @click.stop
      >
        <div class="flex items-start justify-between gap-4 border-b border-neutral-border px-6 py-4">
          <h2 id="skills-gap-modal-title" class="text-xl font-heading font-semibold text-brand-charcoal">
            Skills gap for this job
          </h2>
          <button
            type="button"
            class="shrink-0 rounded-lg p-2 text-neutral-body hover:bg-neutral-bg focus:outline-none focus:ring-2 focus:ring-brand-primary"
            aria-label="Close"
            @click="emit('close')"
          >
            <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div v-if="result" class="space-y-5">
            <div v-if="result.matchingSkills.length">
              <h3 class="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-charcoal">
                <font-awesome-icon :icon="['fas', 'circle-check']" class="text-green-600" aria-hidden="true" />
                Skills you already show
              </h3>
              <ul class="flex flex-wrap gap-2">
                <li
                  v-for="skill in result.matchingSkills"
                  :key="skill"
                  class="rounded-full bg-green-50 px-3 py-1 text-xs text-green-800"
                >
                  {{ skill }}
                </li>
              </ul>
            </div>
            <div v-if="result.missingSkills.length">
              <h3 class="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-charcoal">
                <font-awesome-icon
                  :icon="['fas', 'exclamation-triangle']"
                  class="text-amber-600"
                  aria-hidden="true"
                />
                Skills this job wants that your resume doesn't show
              </h3>
              <ul class="flex flex-wrap gap-2">
                <li
                  v-for="skill in result.missingSkills"
                  :key="skill"
                  class="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800"
                >
                  {{ skill }}
                </li>
              </ul>
            </div>
            <div v-if="result.learningTopics.length">
              <h3 class="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-charcoal">
                <font-awesome-icon :icon="['fas', 'graduation-cap']" class="text-brand-primary" aria-hidden="true" />
                What to go learn
              </h3>
              <ul class="list-disc space-y-1 pl-5 text-sm">
                <li v-for="topic in result.learningTopics" :key="topic">
                  <a
                    :href="courseSearchUrl(topic)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-brand-primary hover:underline"
                  >
                    {{ topic }}
                    <font-awesome-icon
                      :icon="['fas', 'arrow-up-right-from-square']"
                      class="text-xs opacity-70"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              </ul>
            </div>
            <p v-if="!result.missingSkills.length" class="text-sm text-neutral-body">
              Your resume already shows everything this job asks for.
            </p>
          </div>
          <div
            v-else-if="errorMessage"
            class="flex flex-col items-center justify-center gap-3 py-8 text-center text-sm text-neutral-body"
          >
            <font-awesome-icon :icon="['fas', 'exclamation-triangle']" class="text-2xl text-red-600" aria-hidden="true" />
            <p class="text-red-600">{{ errorMessage }}</p>
            <p>Close this dialog and try again.</p>
          </div>
          <div
            v-else
            class="flex flex-col items-center justify-center gap-3 py-8 text-center text-sm text-neutral-body"
          >
            <font-awesome-icon :icon="['fas', 'spinner']" spin class="text-2xl text-brand-primary" aria-hidden="true" />
            <p>Comparing your resume against this job…</p>
          </div>
        </div>
        <div class="border-t border-neutral-border px-6 py-4">
          <button type="button" class="btn-primary w-full sm:w-auto" @click="emit('close')">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
