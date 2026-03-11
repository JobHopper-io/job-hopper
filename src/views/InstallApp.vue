<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import chromeInstallIcon from '@/assets/chrome-install-icon.png'
import edgeInstallIcon from '@/assets/edge-install-icon.png'

type BrowserKind = 'safari' | 'chrome' | 'edge' | 'firefox' | 'other'

type Scenario =
  | 'auto'
  | 'ios-safari'
  | 'ios-other'
  | 'android-chrome-edge'
  | 'android-other'
  | 'desktop-chrome'
  | 'desktop-edge'
  | 'desktop-other'

const isIOS = ref(false)
const isAndroid = ref(false)
const isDesktop = ref(false)
const browser = ref<BrowserKind>('other')
const isStandalone = ref(false)
const selectedScenario = ref<Scenario>('auto')

onMounted(() => {
  if (typeof window === 'undefined') return

  const ua = window.navigator.userAgent || ''
  const uaLower = ua.toLowerCase()

  const iosMatch = /iphone|ipad|ipod/.test(uaLower)
  const androidMatch = /android/.test(uaLower)

  isIOS.value = iosMatch
  isAndroid.value = androidMatch
  isDesktop.value = !iosMatch && !androidMatch

  if (ua.includes('Edg/')) {
    browser.value = 'edge'
  } else if (ua.includes('Chrome/')) {
    browser.value = 'chrome'
  } else if (ua.includes('Safari/')) {
    browser.value = 'safari'
  } else if (ua.includes('Firefox/')) {
    browser.value = 'firefox'
  } else {
    browser.value = 'other'
  }

  const mq = window.matchMedia?.('(display-mode: standalone)')
  const standaloneMatch = mq?.matches === true
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  isStandalone.value = standaloneMatch || iosStandalone
})

const detectedScenario = computed<Exclude<Scenario, 'auto'>>(() => {
  if (isIOS.value && browser.value === 'safari') return 'ios-safari'
  if (isIOS.value) return 'ios-other'
  if (isAndroid.value && (browser.value === 'chrome' || browser.value === 'edge')) {
    return 'android-chrome-edge'
  }
  if (isAndroid.value) return 'android-other'
  if (isDesktop.value && browser.value === 'chrome') return 'desktop-chrome'
  if (isDesktop.value && browser.value === 'edge') return 'desktop-edge'
  return 'desktop-other'
})

const activeScenario = computed<Exclude<Scenario, 'auto'>>(() =>
  selectedScenario.value === 'auto' ? detectedScenario.value : selectedScenario.value,
)

const showIosSafari = computed(() => activeScenario.value === 'ios-safari')
const showIosOther = computed(() => activeScenario.value === 'ios-other')
const showAndroidChromeEdge = computed(() => activeScenario.value === 'android-chrome-edge')
const showAndroidOther = computed(() => activeScenario.value === 'android-other')
const showDesktopChrome = computed(() => activeScenario.value === 'desktop-chrome')
const showDesktopEdge = computed(() => activeScenario.value === 'desktop-edge')
const showDesktopOther = computed(() => activeScenario.value === 'desktop-other')

const showFallback = computed(
  () =>
    !showIosSafari.value &&
    !showIosOther.value &&
    !showAndroidChromeEdge.value &&
    !showAndroidOther.value &&
    !showDesktopChrome.value &&
    !showDesktopOther.value,
)
</script>

<template>
  <div class="min-h-screen bg-neutral-bg py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-3xl mx-auto">
      <div class="mb-8">
        <h1 class="text-3xl font-heading font-bold text-brand-charcoal mb-3">
          Install Job-Hopper on your device
        </h1>
        <p class="text-neutral-body max-w-2xl">
          Job-Hopper is a progressive web app. You can add it to your home screen or install it
          like a native app—no app store required.
        </p>
        <div class="mt-4">
          <label
            for="install-scenario"
            class="block text-xs font-medium text-neutral-body/80 mb-1"
          >
            View instructions for
          </label>
          <select
            id="install-scenario"
            v-model="selectedScenario"
            class="block w-full sm:w-72 rounded-md border border-neutral-border bg-neutral-card px-3 py-2 text-sm text-brand-charcoal shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value="auto">
              Auto-detect (recommended)
            </option>
            <option value="ios-safari">
              iPhone or iPad · Safari
            </option>
            <option value="ios-other">
              iPhone or iPad · other browser
            </option>
            <option value="android-chrome-edge">
              Android · Chrome/Edge
            </option>
            <option value="android-other">
              Android · other browser
            </option>
            <option value="desktop-chrome">
              Desktop · Chrome
            </option>
            <option value="desktop-edge">
              Desktop · Edge
            </option>
            <option value="desktop-other">
              Desktop · other browser
            </option>
          </select>
        </div>
      </div>

      <div v-if="isStandalone" class="card mb-8 p-6 border border-emerald-200 bg-emerald-50">
        <h2 class="text-lg font-heading font-semibold text-brand-charcoal mb-2">
          You’re all set
        </h2>
        <p class="text-neutral-body">
          It looks like Job-Hopper is already installed and running in app mode on this device. You
          can launch it again from your home screen, app drawer, or dock.
        </p>
      </div>

      <div class="space-y-6">
        <section
          v-if="showIosSafari"
          class="card p-6"
        >
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-3">
            iPhone or iPad (Safari)
          </h2>
          <p class="text-neutral-body mb-3">
            On iOS, apps like Job-Hopper can only be installed from Safari using “Add to Home
            Screen”.
          </p>
          <ol class="list-decimal pl-5 space-y-2 text-neutral-body">
            <li>Tap the Share icon in the Safari toolbar (square with an arrow pointing up).</li>
            <li>Scroll down in the sheet and tap <span class="font-medium">Add to Home Screen</span>.</li>
            <li>Optionally rename it to <span class="font-medium">Job-Hopper</span>, then tap
              <span class="font-medium">Add</span>.
            </li>
            <li>Find Job-Hopper on your home screen and open it like any other app.</li>
          </ol>
        </section>

        <section
          v-else-if="showIosOther"
          class="card p-6"
        >
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-3">
            iPhone or iPad (other browser)
          </h2>
          <p class="text-neutral-body mb-3">
            iOS only lets you install web apps to the home screen from Safari.
          </p>
          <ol class="list-decimal pl-5 space-y-2 text-neutral-body">
            <li>Copy this page’s address.</li>
            <li>Open Safari and paste <span class="font-mono text-[0.8rem]">job-hopper.com</span> into the address bar.</li>
            <li>Once the site loads, tap the Share icon and choose
              <span class="font-medium">Add to Home Screen</span>.
            </li>
          </ol>
        </section>

        <section
          v-else-if="showAndroidChromeEdge"
          class="card p-6"
        >
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-3">
            Android (Chrome or Edge)
          </h2>
          <p class="text-neutral-body mb-3">
            Most Android browsers let you install Job-Hopper so it behaves like a native app.
          </p>
          <ol class="list-decimal pl-5 space-y-2 text-neutral-body">
            <li>
              Look for an <span class="font-medium">Install</span> or
              <span class="font-medium">Add to Home screen</span> prompt near the address bar, or:
            </li>
            <li>
              Open the browser menu (three dots), then tap
              <span class="font-medium">Install app</span> or
              <span class="font-medium">Add to Home screen</span>.
            </li>
            <li>Confirm the install. Job-Hopper will appear in your app drawer and on your home screen.</li>
          </ol>
          <p class="mt-3 text-xs text-neutral-body/80">
            If you don’t see the install option, make sure you’re online, using HTTPS, and have
            kept this page open for a few seconds.
          </p>
        </section>

        <section
          v-else-if="showAndroidOther"
          class="card p-6"
        >
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-3">
            Android (other browser)
          </h2>
          <p class="text-neutral-body mb-3">
            Some Android browsers have limited support for installing web apps.
          </p>
          <ol class="list-decimal pl-5 space-y-2 text-neutral-body">
            <li>
              Check the browser menu for an option like
              <span class="font-medium">Install app</span> or
              <span class="font-medium">Add to Home screen</span>.
            </li>
            <li>If you don’t see it, try opening this site in Chrome for the best install experience.</li>
          </ol>
        </section>

        <section
          v-else-if="showDesktopChrome"
          class="card p-6"
        >
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-3">
            Desktop (Chrome)
          </h2>
          <p class="text-neutral-body mb-3">
            You can install Job-Hopper as a standalone app window on your computer.
          </p>
          <ol class="list-decimal pl-5 space-y-2 text-neutral-body">
            <li>
              Look for this install icon near the address bar:
              <img
                :src="chromeInstallIcon"
                alt="Chrome install icon"
                class="ml-1 inline-block h-5 w-auto align-middle"
              >
            </li>
            <li>Click it, then choose <span class="font-medium">Install</span> or
              <span class="font-medium">Install Job-Hopper</span>.
            </li>
            <li>
              Job-Hopper will open in its own window and can be pinned to your taskbar or dock like
              a regular app.
            </li>
          </ol>
        </section>

        <section
          v-else-if="showDesktopEdge"
          class="card p-6"
        >
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-3">
            Desktop (Edge)
          </h2>
          <p class="text-neutral-body mb-3">
            Microsoft Edge also lets you install Job-Hopper as its own app window.
          </p>
          <ol class="list-decimal pl-5 space-y-2 text-neutral-body">
            <li>
              Look for this app icon near the address bar:
              <img
                :src="edgeInstallIcon"
                alt="Edge install icon"
                class="ml-1 inline-block h-5 w-auto align-middle"
              >
            </li>
            <li>Click it, then choose <span class="font-medium">Install</span> or
              <span class="font-medium">Install this site as an app</span>.
            </li>
            <li>
              Job-Hopper will open in its own window and can be pinned to your taskbar or Start
              menu.
            </li>
          </ol>
        </section>

        <section
          v-else-if="showFallback || showDesktopOther"
          class="card p-6"
        >
          <h2 class="text-xl font-heading font-semibold text-brand-charcoal mb-3">
            Using another browser
          </h2>
          <p class="text-neutral-body mb-3">
            Your browser may have limited support for installing progressive web apps.
          </p>
          <ol class="list-decimal pl-5 space-y-2 text-neutral-body">
            <li>
              Check your browser’s menu for options like
              <span class="font-medium">Install app</span> or
              <span class="font-medium">Add to Home screen</span>.
            </li>
            <li>
              If you don’t see any install option, try opening
              <span class="font-mono text-[0.8rem]">job-hopper.com</span> in Chrome, Edge, or
              Safari (on iOS) for the best experience.
            </li>
          </ol>
        </section>
      </div>
    </div>
  </div>
</template>

