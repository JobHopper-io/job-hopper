<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import {
  ShaderMount,
  meshGradientFragmentShader,
  getShaderColorFromString,
  ShaderFitOptions,
  defaultObjectSizing,
} from '@paper-design/shaders'

const props = withDefaults(
  defineProps<{
    colors?: string[]
    distortion?: number
    swirl?: number
    grainMixer?: number
    grainOverlay?: number
    speed?: number
    rotation?: number
    offsetX?: number
    offsetY?: number
  }>(),
  {
    colors: () => ['#d9b982db', '#4d74e0c7'],
    distortion: 0.21,
    swirl: 1,
    grainMixer: 0.41,
    grainOverlay: 0.06,
    speed: 0.6,
    rotation: 84,
    offsetX: -0.5,
    offsetY: -0.34,
  },
)

const container = ref<HTMLDivElement | null>(null)
let mount: InstanceType<typeof ShaderMount> | null = null

onMounted(() => {
  if (!container.value) return
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  mount = new ShaderMount(
    container.value,
    meshGradientFragmentShader,
    {
      u_colors: props.colors.map(getShaderColorFromString),
      u_colorsCount: props.colors.length,
      u_distortion: props.distortion,
      u_swirl: props.swirl,
      u_grainMixer: props.grainMixer,
      u_grainOverlay: props.grainOverlay,
      u_fit: ShaderFitOptions.cover,
      u_rotation: props.rotation,
      u_scale: defaultObjectSizing.scale,
      u_offsetX: props.offsetX,
      u_offsetY: props.offsetY,
      u_originX: defaultObjectSizing.originX,
      u_originY: defaultObjectSizing.originY,
      u_worldWidth: defaultObjectSizing.worldWidth,
      u_worldHeight: defaultObjectSizing.worldHeight,
    },
    undefined,
    prefersReducedMotion ? 0 : props.speed,
  )
})

onUnmounted(() => {
  mount?.dispose()
})
</script>

<template>
  <div ref="container" data-paper-shader class="absolute inset-0" aria-hidden="true"></div>
</template>
