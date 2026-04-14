<script setup lang="ts">
import { ref, computed } from 'vue'
import { normalizeLocation } from '@/lib/location'

const props = defineProps<{
  modelValue: string[]
  label?: string
  inputId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const inputValue = ref('')
const validationError = ref<string | null>(null)
const previewNormalized = ref<string | null>(null)
const previewError = ref<string | null>(null)
let previewTimeout: number | null = null

const normalizedKey = (s: string) => s.trim().toLowerCase()

const isDuplicate = (value: string) => {
  const key = normalizedKey(value)
  return props.modelValue.some((loc) => normalizedKey(loc) === key)
}

async function runPreview(value: string) {
  validationError.value = null
  previewNormalized.value = null
  previewError.value = null

  const trimmed = value.trim()
  if (!trimmed) {
    return
  }

  const { normalized, error } = await normalizeLocation(trimmed)
  previewNormalized.value = normalized
  previewError.value = error
}

function schedulePreview(value: string) {
  if (previewTimeout !== null) {
    window.clearTimeout(previewTimeout)
  }
  previewTimeout = window.setTimeout(() => {
    void runPreview(value)
  }, 300)
}

let addLocationInFlight = false

function commitLocationInput() {
  if (previewTimeout !== null) {
    window.clearTimeout(previewTimeout)
    previewTimeout = null
  }
  void addLocation()
}

function onInputBlur() {
  commitLocationInput()
}

async function addLocation() {
  if (addLocationInFlight) return
  addLocationInFlight = true
  try {
    validationError.value = null
    const trimmed = inputValue.value.trim()
    if (!trimmed) {
      previewNormalized.value = null
      previewError.value = null
      return
    }

    const { normalized, error } = await normalizeLocation(trimmed)
    if (error) {
      validationError.value = error
      previewError.value = error
      previewNormalized.value = null
      return
    }
    if (!normalized) return
    if (isDuplicate(normalized)) {
      inputValue.value = ''
      previewNormalized.value = null
      previewError.value = null
      return
    }
    emit('update:modelValue', [...props.modelValue, normalized])
    inputValue.value = ''
    previewNormalized.value = null
    previewError.value = null
  } finally {
    addLocationInFlight = false
  }
}

function removeLocation(index: number) {
  const next = props.modelValue.filter((_, i) => i !== index)
  emit('update:modelValue', next)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitLocationInput()
  }
}

const listAriaLabel = computed(() =>
  props.label ? `List of preferred locations: ${props.modelValue.join(', ')}` : 'Preferred locations'
)
</script>

<template>
  <div class="space-y-2">
    <label v-if="label" :for="inputId ?? 'preferred-locations-input'" class="block text-sm font-medium text-brand-charcoal">
      {{ label }}
    </label>
    <div class="flex flex-wrap items-center gap-2 rounded-[12px] border-2 border-neutral-border bg-white p-2 focus-within:border-brand-primary/50">
      <ul
        v-if="modelValue.length > 0"
        class="flex flex-wrap gap-2 contents"
        role="list"
        :aria-label="listAriaLabel"
      >
        <li
          v-for="(loc, index) in modelValue"
          :key="`${loc}-${index}`"
          class="inline-flex items-center gap-1 rounded-lg bg-neutral-bg px-2 py-1 text-sm text-brand-charcoal"
        >
          <span>{{ loc }}</span>
          <button
            type="button"
            class="rounded p-0.5 text-neutral-body hover:bg-neutral-border hover:text-brand-charcoal focus:outline-none focus:ring-2 focus:ring-brand-primary"
            :aria-label="`Remove ${loc}`"
            @click="removeLocation(index)"
          >
            <font-awesome-icon :icon="['fas', 'xmark']" class="text-xs" />
          </button>
        </li>
      </ul>
      <input
        :id="inputId ?? 'preferred-locations-input'"
        v-model="inputValue"
        type="text"
        class="input min-w-[12rem] flex-1 border-0 p-1 shadow-none focus:ring-0"
        placeholder="City, State or ZIP — tab away, Enter, or Add Location"
        autocomplete="off"
        @blur="onInputBlur"
        @keydown="onKeydown"
        @input="schedulePreview(inputValue)"
      />
    </div>
    <button type="button" class="btn-secondary text-sm" @click="commitLocationInput">
      Add Location
    </button>
    <div class="min-h-[1.25rem]">
      <p
        v-if="previewNormalized && !validationError && !previewError"
        class="text-xs text-neutral-body"
      >
        Will add as:
        <span class="font-mono">{{ previewNormalized }}</span>
      </p>
      <p v-else-if="validationError || previewError" class="text-xs text-red-600" role="alert">
        {{ validationError || previewError }}
      </p>
    </div>
  </div>
</template>
