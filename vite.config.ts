import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(async ({ command, mode }) => {
  const plugins: any[] = [vue()]
  
  // Only enable devtools in dev mode to avoid localStorage errors during build
  if (command === 'serve') {
    try {
      const vueDevTools = (await import('vite-plugin-vue-devtools')).default
      plugins.push(vueDevTools())
    } catch {
      // Devtools not available, continue without it
    }
  }
  
  return {
    plugins,
    server: {
      port: 5173,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
  }
})

