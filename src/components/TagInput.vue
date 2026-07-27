<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    label?: string
    inputId?: string
    placeholder?: string
  }>(),
  { placeholder: 'Type and press Enter to add' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const inputValue = ref('')

function addTag() {
  const trimmed = inputValue.value.trim()
  if (!trimmed) return
  const isDuplicate = props.modelValue.some((t) => t.toLowerCase() === trimmed.toLowerCase())
  if (!isDuplicate) emit('update:modelValue', [...props.modelValue, trimmed])
  inputValue.value = ''
}

function removeTag(index: number) {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index),
  )
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    addTag()
  } else if (event.key === 'Backspace' && !inputValue.value && props.modelValue.length > 0) {
    removeTag(props.modelValue.length - 1)
  }
}
</script>

<template>
  <div class="space-y-2">
    <label v-if="label" :for="inputId ?? 'tag-input'" class="block text-sm font-medium text-brand-charcoal">
      {{ label }}
    </label>
    <div
      class="flex flex-wrap items-center gap-2 rounded-[12px] border-2 border-neutral-border bg-white p-2 focus-within:border-brand-primary/50"
    >
      <ul v-if="modelValue.length > 0" class="flex flex-wrap gap-2 contents" role="list">
        <li
          v-for="(tag, index) in modelValue"
          :key="`${tag}-${index}`"
          class="inline-flex items-center gap-1 rounded-lg bg-brand-primary/10 px-2 py-1 text-sm text-brand-primary"
        >
          <span>{{ tag }}</span>
          <button
            type="button"
            class="rounded p-0.5 text-brand-primary/70 hover:bg-brand-primary/20 hover:text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
            :aria-label="`Remove ${tag}`"
            @click="removeTag(index)"
          >
            <font-awesome-icon :icon="['fas', 'xmark']" class="text-xs" />
          </button>
        </li>
      </ul>
      <input
        :id="inputId ?? 'tag-input'"
        v-model="inputValue"
        type="text"
        class="input min-w-[12rem] flex-1 border-0 p-1 shadow-none focus:ring-0"
        :placeholder="placeholder"
        autocomplete="off"
        @keydown="onKeydown"
        @blur="addTag"
      />
    </div>
  </div>
</template>
