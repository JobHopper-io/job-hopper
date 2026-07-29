<script setup lang="ts">
import { ref, computed } from 'vue'
import FormField from '@/components/auth/FormField.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    id: string
    placeholder?: string
    error?: string | null
    autocomplete?: string
    required?: boolean
  }>(),
  { autocomplete: 'current-password' },
)

defineEmits<{ 'update:modelValue': [value: string] }>()

const show = ref(false)
const type = computed(() => (show.value ? 'text' : 'password'))
</script>

<template>
  <FormField
    :id="id"
    :label="label"
    :type="type"
    :model-value="modelValue"
    :placeholder="placeholder"
    :error="error"
    :autocomplete="autocomplete"
    :required="required"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #suffix>
      <button
        type="button"
        tabindex="-1"
        class="text-neutral-body/70 hover:text-neutral-body"
        :aria-label="show ? `Hide ${props.label.toLowerCase()}` : `Show ${props.label.toLowerCase()}`"
        @click="show = !show"
      >
        <font-awesome-icon :icon="['fas', show ? 'eye-slash' : 'eye']" class="text-sm" aria-hidden="true" />
      </button>
    </template>
  </FormField>
</template>
