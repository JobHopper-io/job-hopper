<template>
  <div class="rag-chat-widget">
    <button v-if="!isOpen" class="rag-chat-toggle" @click="isOpen = true">
      Ask Job-Hopper
    </button>

    <div v-else class="rag-chat-panel">
      <div class="rag-chat-header">
        <span>Support Chat</span>
        <button class="rag-chat-close" aria-label="Close" @click="isOpen = false">
          <font-awesome-icon :icon="['fas', 'xmark']" />
        </button>
      </div>

      <div class="rag-chat-messages" ref="messageList">
        <div
          v-for="(msg, i) in messages"
          :key="i"
          :class="['rag-chat-message', msg.role]"
        >
          {{ msg.content }}
        </div>
        <div v-if="isLoading" class="rag-chat-message assistant loading">
          Thinking...
        </div>
      </div>

      <form class="rag-chat-input-row" @submit.prevent="sendMessage">
        <input
          v-model="draft"
          type="text"
          placeholder="Ask about pricing, sponsorship, or your account..."
          :disabled="isLoading"
        />
        <button type="submit" :disabled="isLoading || !draft.trim()">Send</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'

const WEBHOOK_URL = import.meta.env.VITE_RAG_CHAT_WEBHOOK_URL
const CHAT_AUTH = import.meta.env.VITE_RAG_CHAT_AUTH

const isOpen = ref(false)
const isLoading = ref(false)
const draft = ref('')
const messages = ref([
  { role: 'assistant', content: 'Hi! I can answer questions about pricing, how matching works, and our sponsorship methodology. What do you want to know?' }
])
const messageList = ref<HTMLDivElement | null>(null)

async function scrollToBottom() {
  await nextTick()
  if (messageList.value) {
    messageList.value.scrollTop = messageList.value.scrollHeight
  }
}

async function sendMessage() {
  const text = draft.value.trim()
  if (!text || isLoading.value) return

  messages.value.push({ role: 'user', content: text })
  draft.value = ''
  isLoading.value = true
  await scrollToBottom()

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chat-Auth': CHAT_AUTH
      },
      body: JSON.stringify({ message: text })
    })

    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`)
    }

    const data = await res.json()
    messages.value.push({
      role: 'assistant',
      content: data.answer || "Sorry, something went wrong on my end."
    })
  } catch {
    messages.value.push({
      role: 'assistant',
      content: "I couldn't reach support chat right now. Please try again in a moment, or email support@job-hopper.io."
    })
  } finally {
    isLoading.value = false
    await scrollToBottom()
  }
}
</script>

<style scoped>
.rag-chat-widget {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.rag-chat-toggle {
  padding: 12px 18px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  font-weight: 600;
  background-color: var(--color-brand-primary);
  color: #fff;
}
.rag-chat-toggle:hover {
  opacity: 0.9;
}
.rag-chat-panel {
  width: 320px;
  height: 420px;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0,0,0,0.2);
  background-color: var(--color-neutral-card);
}
.rag-chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  font-weight: 600;
  font-family: 'Poppins', sans-serif;
  background-color: var(--color-neutral-card);
  color: var(--color-charcoal);
  border-bottom: 1px solid var(--color-neutral-border);
}
.rag-chat-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--color-neutral-body);
}
.rag-chat-close:hover {
  color: var(--color-brand-primary);
}
.rag-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: var(--color-neutral-bg);
}
.rag-chat-message {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.4;
}
.rag-chat-message.user {
  align-self: flex-end;
  background-color: var(--color-brand-primary);
  color: #fff;
}
.rag-chat-message.assistant {
  align-self: flex-start;
  background-color: var(--color-neutral-card);
  color: var(--color-neutral-body);
  border: 1px solid var(--color-neutral-border);
}
.rag-chat-message.loading {
  opacity: 0.6;
  font-style: italic;
}
.rag-chat-input-row {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--color-neutral-border);
  background-color: var(--color-neutral-card);
}
.rag-chat-input-row input {
  flex: 1;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--color-neutral-border);
}
.rag-chat-input-row input:focus {
  outline: none;
  border-color: var(--color-brand-primary);
}
.rag-chat-input-row button {
  padding: 8px 14px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  font-weight: 600;
  background-color: var(--color-brand-primary);
  color: #fff;
}
</style>
