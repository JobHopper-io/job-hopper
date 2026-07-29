<script setup lang="ts">
import { ref } from 'vue'

withDefaults(
  defineProps<{
    modelValue: string
    label: string
    id: string
    type?: string
    placeholder?: string
    error?: string | null
    autocomplete?: string
    required?: boolean
  }>(),
  { type: 'text' },
)

defineEmits<{ 'update:modelValue': [value: string] }>()

const focused = ref(false)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-[11px] font-bold uppercase tracking-wider text-neutral-body">{{ label }}</label>
    <div class="relative">
      <input
        :id="id"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :required="required"
        class="h-12 w-full rounded-[12px] text-sm outline-none transition-all duration-200"
        :class="[$slots.suffix ? 'pl-4 pr-11' : 'px-4', error ? 'bg-red-50' : focused ? 'bg-white' : 'bg-neutral-bg']"
        :style="{
          border: `1.5px solid ${error ? '#DC2626' : focused ? '#2F6ECC' : '#E5E7EB'}`,
          boxShadow: focused && !error ? '0 0 0 4px rgba(47,110,204,0.08)' : 'none',
        }"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @focus="focused = true"
        @blur="focused = false"
      />
      <span v-if="$slots.suffix" class="absolute right-3 top-1/2 -translate-y-1/2">
        <slot name="suffix" />
      </span>
    </div>
    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
  </div>
</template>
