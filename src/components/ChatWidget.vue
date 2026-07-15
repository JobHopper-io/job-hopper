<template>
  <div class="rag-chat-widget">
    <button v-if="!isOpen" class="rag-chat-toggle" aria-label="Open Hopper support chat" @click="isOpen = true">
      <img :src="hopperLogo" alt="" class="rag-chat-toggle-avatar" />
      <span>Ask Hopper</span>
    </button>

    <div v-else class="rag-chat-panel">
      <div class="rag-chat-header">
        <div class="rag-chat-header-identity">
          <img :src="hopperLogo" alt="" class="rag-chat-header-avatar" />
          <div class="rag-chat-header-text">
            <span class="rag-chat-header-name">Hopper</span>
            <span class="rag-chat-header-subtitle">Job-Hopper Assistant</span>
          </div>
        </div>
        <button class="rag-chat-close" aria-label="Close" @click="isOpen = false">
          <font-awesome-icon :icon="['fas', 'xmark']" />
        </button>
      </div>

      <div class="rag-chat-messages" ref="messageList">
        <div
          v-for="(msg, i) in messages"
          :key="i"
          :class="['rag-chat-message-row', msg.role]"
        >
          <img v-if="msg.role === 'assistant'" :src="hopperLogo" alt="" class="rag-chat-avatar" />
          <div :class="['rag-chat-message', msg.role]">
            {{ msg.content }}
          </div>
        </div>
        <div v-if="isLoading" class="rag-chat-message-row assistant">
          <img :src="hopperLogo" alt="" class="rag-chat-avatar" />
          <div class="rag-chat-message assistant loading">
            <span class="rag-chat-typing-dot" />
            <span class="rag-chat-typing-dot" />
            <span class="rag-chat-typing-dot" />
          </div>
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
import hopperLogo from '@/assets/job-hopper-rabbit.png'

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

/* ---------- toggle (collapsed) ---------- */
.rag-chat-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px 10px 10px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  color: var(--color-charcoal);
  background: linear-gradient(135deg, var(--color-rabbit-start), var(--color-rabbit-end));
  box-shadow: 0 8px 24px rgba(47, 110, 204, 0.35), 0 2px 6px rgba(17, 24, 39, 0.15);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  animation: rag-chat-toggle-pulse 3s ease-in-out infinite;
}
.rag-chat-toggle:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(47, 110, 204, 0.45), 0 4px 10px rgba(17, 24, 39, 0.18);
}
.rag-chat-toggle-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  background-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);
}
@keyframes rag-chat-toggle-pulse {
  0%, 100% {
    box-shadow: 0 8px 24px rgba(47, 110, 204, 0.35), 0 2px 6px rgba(17, 24, 39, 0.15);
  }
  50% {
    box-shadow: 0 8px 28px rgba(47, 110, 204, 0.5), 0 2px 8px rgba(17, 24, 39, 0.18);
  }
}

/* ---------- panel (expanded) ---------- */
.rag-chat-panel {
  width: 336px;
  height: 460px;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 48px rgba(17, 24, 39, 0.22), 0 4px 12px rgba(17, 24, 39, 0.1);
  background-color: var(--color-neutral-card);
  animation: rag-chat-panel-in 0.2s ease-out;
}
@keyframes rag-chat-panel-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.rag-chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: linear-gradient(135deg, var(--color-rabbit-start), var(--color-rabbit-end));
}
.rag-chat-header-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rag-chat-header-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  background-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);
}
.rag-chat-header-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.rag-chat-header-name {
  font-family: 'Poppins', sans-serif;
  font-weight: 700;
  font-size: 15px;
  color: var(--color-charcoal);
}
.rag-chat-header-subtitle {
  font-size: 11px;
  color: rgba(17, 24, 39, 0.65);
}
.rag-chat-close {
  background: rgba(255, 255, 255, 0.4);
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  color: var(--color-charcoal);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}
.rag-chat-close:hover {
  background: rgba(255, 255, 255, 0.7);
}

/* ---------- messages ---------- */
.rag-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: var(--color-neutral-bg);
}
.rag-chat-messages::-webkit-scrollbar {
  width: 6px;
}
.rag-chat-messages::-webkit-scrollbar-thumb {
  background-color: var(--color-neutral-border);
  border-radius: 999px;
}

.rag-chat-message-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.rag-chat-message-row.user {
  justify-content: flex-end;
}

.rag-chat-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background-color: #fff;
  box-shadow: 0 0 0 1px var(--color-neutral-border);
}

.rag-chat-message {
  max-width: 78%;
  padding: 9px 13px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.45;
}
.rag-chat-message.user {
  background-color: var(--color-brand-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.rag-chat-message.assistant {
  background-color: var(--color-neutral-card);
  color: var(--color-neutral-body);
  border: 1px solid var(--color-neutral-border);
  border-bottom-left-radius: 4px;
}
.rag-chat-message.loading {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 14px;
}
.rag-chat-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-neutral-body);
  opacity: 0.5;
  animation: rag-chat-typing 1.2s ease-in-out infinite;
}
.rag-chat-typing-dot:nth-child(2) {
  animation-delay: 0.15s;
}
.rag-chat-typing-dot:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes rag-chat-typing {
  0%, 60%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

/* ---------- input row ---------- */
.rag-chat-input-row {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--color-neutral-border);
  background-color: var(--color-neutral-card);
}
.rag-chat-input-row input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--color-neutral-border);
  font-size: 14px;
}
.rag-chat-input-row input:focus {
  outline: none;
  border-color: var(--color-brand-primary);
}
.rag-chat-input-row button {
  padding: 8px 16px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  font-weight: 600;
  background-color: var(--color-brand-primary);
  color: #fff;
  transition: opacity 0.15s ease;
}
.rag-chat-input-row button:hover:not(:disabled) {
  opacity: 0.9;
}
.rag-chat-input-row button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
