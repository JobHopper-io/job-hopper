<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/bodyScrollLock'
import type { SkillsGapResult } from '@/lib/skillsGap'
import { coursePlatformsForTier, type CourseTier } from '@/lib/coursePlatforms'

const props = defineProps<{
  open: boolean
  loading: boolean
  result: SkillsGapResult | null
  errorMessage: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const activeTier = ref<CourseTier>('free')

function onBackdropClick() {
  emit('close')
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
              <div class="mb-3 flex items-center justify-between gap-2">
                <h3 class="flex items-center gap-2 text-sm font-semibold text-brand-charcoal">
                  <font-awesome-icon :icon="['fas', 'graduation-cap']" class="text-brand-primary" aria-hidden="true" />
                  What to go learn
                </h3>
                <div class="inline-flex shrink-0 rounded-full border border-neutral-border bg-neutral-bg p-0.5">
                  <button
                    type="button"
                    class="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                    :class="activeTier === 'free' ? 'bg-white text-brand-primary shadow-sm' : 'text-neutral-body'"
                    @click="activeTier = 'free'"
                  >
                    Free
                  </button>
                  <button
                    type="button"
                    class="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                    :class="activeTier === 'paid' ? 'bg-white text-brand-primary shadow-sm' : 'text-neutral-body'"
                    @click="activeTier = 'paid'"
                  >
                    Paid
                  </button>
                </div>
              </div>
              <div class="space-y-3">
                <div
                  v-for="topic in result.learningTopics"
                  :key="topic"
                  class="rounded-[12px] border border-neutral-border p-3"
                >
                  <p class="mb-2 text-sm font-medium text-brand-charcoal">{{ topic }}</p>
                  <div class="flex flex-wrap gap-2">
                    <a
                      v-for="platform in coursePlatformsForTier(activeTier)"
                      :key="platform.name"
                      :href="platform.buildUrl(topic)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1.5 rounded-full border border-neutral-border bg-neutral-bg px-3 py-1.5 text-xs font-medium text-neutral-body transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/5 hover:text-brand-primary"
                    >
                      <font-awesome-icon :icon="platform.icon" class="text-[11px] opacity-80" aria-hidden="true" />
                      {{ platform.name }}
                      <font-awesome-icon
                        :icon="['fas', 'arrow-up-right-from-square']"
                        class="text-[10px] opacity-60"
                        aria-hidden="true"
                      />
                    </a>
                  </div>
                </div>
              </div>
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
