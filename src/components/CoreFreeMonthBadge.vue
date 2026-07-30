<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { subscriptionAPI } from '@/lib/subscription'

/** "First 25 Core subscribers get a free month" promo pill. Self-contained: fetches its own
 * status and renders nothing once the 25 real spots are gone, so every call site can just
 * drop it in without tracking promo state itself.
 *
 * DISPLAY_REMAINING is a fixed marketing number, not the real live count (product decision -
 * showing the true count read as unpersuasive when close to 25/25 unclaimed). The actual cap
 * enforced server-side (try_claim_core_free_month) is always the real 25, atomic and honest;
 * only this copy is fixed. `active` still reflects the real remaining count, so the badge
 * correctly disappears everywhere once the true 25 slots are gone, even though the number
 * shown while active never changes. */
const DISPLAY_REMAINING = 9
const active = ref(false)

onMounted(async () => {
  const { data } = await subscriptionAPI.getCoreFreeMonthPromoStatus()
  if (data) {
    active.value = data.active
  }
})
</script>

<template>
  <span
    v-if="active"
    class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
    style="background: linear-gradient(135deg, #FFD75A, #FF8A34);"
  >
    <font-awesome-icon :icon="['fas', 'gift']" aria-hidden="true" />
    First month free — {{ DISPLAY_REMAINING }} of 25 spots left
  </span>
</template>
