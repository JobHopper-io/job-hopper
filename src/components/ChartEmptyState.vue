<template>
  <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
    <font-awesome-icon
      :icon="['fas', 'arrow-up-right-dots']"
      class="text-xl text-neutral-border"
      aria-hidden="true"
    />
    <p class="text-sm text-neutral-muted">
      {{ message }}
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ message: string }>()
</script>
