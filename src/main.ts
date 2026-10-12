import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { registerFontAwesome } from '@/plugins/fontawesome'

const app = createApp(App)

app.use(createPinia())
app.use(router)
registerFontAwesome(app)

app.mount('#app')

// After a deploy, an open tab still references the previous build's chunk filenames,
// which no longer exist, so lazy route imports fail. Reload once to pick up the new build;
// the timestamp guard stops a reload loop if the chunk is genuinely broken.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'chunk-reload-at'
  try {
    const last = Number(sessionStorage.getItem(key) ?? 0)
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem(key, String(Date.now()))
  } catch {
    // sessionStorage unavailable: still reload, the browser will settle on the new build
  }
  event.preventDefault()
  window.location.reload()
})

