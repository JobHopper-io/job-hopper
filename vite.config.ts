import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'

import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [vue()]
  
  // Dev-only: avoid build errors if optional Vue DevTools plugin is missing.
  if (command === 'serve') {
    try {
      const vueDevTools = (await import('vite-plugin-vue-devtools')).default
      const devToolsPlugin = vueDevTools()
      if (devToolsPlugin) plugins.push(devToolsPlugin)
    } catch (e) {
      console.warn('Vue DevTools plugin skipped', e)
    }
  }
  
  return {
    plugins,
    server: {
      port: 5173,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': resolve(__dirname, 'supabase/functions/_shared'),
      },
    },
  }
})

