<script setup lang="ts">
import MeshGradientBackground from './MeshGradientBackground.vue'
</script>

<template>
  <div class="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 py-12">
    <MeshGradientBackground />

    <div class="relative flex flex-col items-center gap-2 mb-8">
      <svg width="34" height="34" viewBox="0 0 30 30">
        <path
          d="M8 24 Q6 20 9 17 Q7 14 10 11 Q9 8 13 6 Q16 4 19 6 L23 4 L22 8 Q25 10 24 14 Q27 15 26 18 L20 17 Q17 19 13 18 Q10 21 8 24 Z"
          fill="#FF8A34"
        />
        <circle cx="21" cy="7" r="1.1" fill="#111827" />
      </svg>
      <span class="font-heading font-bold text-2xl text-brand-primary tracking-tight">Job-Hopper</span>
    </div>

    <div class="relative w-full flex justify-center">
      <slot />
    </div>
  </div>
</template>
