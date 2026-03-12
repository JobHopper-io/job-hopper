<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: number | null
  label?: string
  min?: number
  max?: number
  step?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const effectiveMin = computed(() => props.min ?? 5)
const effectiveMax = computed(() => props.max ?? 100)
const effectiveStep = computed(() => props.step ?? 5)

const currentValue = computed<number>({
  get() {
    const value = props.modelValue
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }
    return 25
  },
  set(value: number) {
    let next = value
    if (Number.isNaN(next)) {
      next = 25
    }
    if (next < effectiveMin.value) next = effectiveMin.value
    if (next > effectiveMax.value) next = effectiveMax.value
    emit('update:modelValue', next)
  },
})
</script>

<template>
  <div class="space-y-1">
    <label v-if="label" class="block text-sm font-medium text-brand-charcoal">
      {{ label }}
    </label>
    <div class="flex items-center gap-3">
      <input
        v-model.number="currentValue"
        type="range"
        :min="effectiveMin"
        :max="effectiveMax"
        :step="effectiveStep"
        class="flex-1"
      />
      <span class="text-sm text-neutral-body whitespace-nowrap">
        Within {{ currentValue }} miles
      </span>
    </div>
  </div>
</template>

