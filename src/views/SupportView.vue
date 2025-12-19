<script setup lang="ts">
import { ref } from 'vue'

const formData = ref({
  name: '',
  email: '',
  subject: '',
  message: ''
})

const isSubmitting = ref(false)
const isSubmitted = ref(false)

const handleSubmit = async (e: Event) => {
  e.preventDefault()
  isSubmitting.value = true
  
  // Simulate form submission
  setTimeout(() => {
    isSubmitting.value = false
    isSubmitted.value = true
    formData.value = { name: '', email: '', subject: '', message: '' }
  }, 1000)
}
</script>

<template>
  <div class="min-h-screen bg-white py-20 px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-brand-charcoal mb-6 text-center">
        We're here to help
      </h1>
      <p class="text-neutral-body mb-12 text-center">
        If you have questions about your subscription, billing, or how Job-Hopper works, we're just a message away.
      </p>

      <!-- Success Message -->
      <div v-if="isSubmitted" class="card p-8 mb-8 bg-green-50 border-green-200">
        <div class="flex items-start">
          <svg class="w-6 h-6 text-green-600 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <div>
            <h3 class="text-lg font-semibold text-green-900 mb-2">Thanks—your message is on its way.</h3>
            <p class="text-green-800">We'll get back to you soon.</p>
          </div>
        </div>
      </div>

      <!-- Contact Form -->
      <form v-else @submit.prevent="handleSubmit" class="card p-8 space-y-6">
        <div>
          <label for="name" class="block text-sm font-medium text-brand-charcoal mb-2">
            Name
          </label>
          <input
            id="name"
            v-model="formData.name"
            type="text"
            required
            class="input"
            placeholder="Your name"
          />
        </div>

        <div>
          <label for="email" class="block text-sm font-medium text-brand-charcoal mb-2">
            Email
          </label>
          <input
            id="email"
            v-model="formData.email"
            type="email"
            required
            class="input"
            placeholder="your.email@example.com"
          />
        </div>

        <div>
          <label for="subject" class="block text-sm font-medium text-brand-charcoal mb-2">
            Subject
          </label>
          <input
            id="subject"
            v-model="formData.subject"
            type="text"
            required
            class="input"
            placeholder="What can we help with?"
          />
        </div>

        <div>
          <label for="message" class="block text-sm font-medium text-brand-charcoal mb-2">
            Message
          </label>
          <textarea
            id="message"
            v-model="formData.message"
            required
            rows="6"
            class="input resize-none"
            placeholder="Tell us more about your question or issue..."
          ></textarea>
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="btn-primary w-full"
        >
          <span v-if="isSubmitting">Sending...</span>
          <span v-else>Send Message</span>
        </button>
      </form>

      <!-- Alternative Contact Info -->
      <div class="mt-12 text-center">
        <p class="text-neutral-body mb-2">
          Prefer email?
        </p>
        <a href="mailto:support@job-hopper.io" class="text-brand-primary hover:underline font-medium">
          support@job-hopper.io
        </a>
        <p class="text-sm text-neutral-body mt-4">
          We typically respond within 1–2 business days.
        </p>
      </div>
    </div>
  </div>
</template>

