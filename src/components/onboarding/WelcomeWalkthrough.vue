<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/bodyScrollLock'

type Tier = 'free' | 'core' | 'premium'

const props = defineProps<{ tier: Tier }>()
const emit = defineEmits<{ (e: 'complete'): void; (e: 'skip'): void }>()

const TOTAL_SLIDES = 6

type TierCopy = {
  s2Headline: string
  s2Body: string
  digestOptions: { label: string; active: string; color: string }[]
  s3Headline: string
  s3Body: string
  contactsCopy: string
  resumeCopy: string
  interviewCopy: string
  avatars: { delay: number }[]
  s5Headline: string
  s5Body: string
}

const COPY_BY_TIER: Record<Tier, TierCopy> = {
  free: {
    s2Headline: 'Run up to 3 manual searches, get up to 5 matches each',
    s2Body: 'Free plan gives you a hands-on taste — search when you want, review your top matches instantly.',
    digestOptions: [],
    s3Headline: 'See which jobs actually sponsor visas',
    s3Body: 'Every match carries a sponsorship signal — upgrade to reveal it on each listing.',
    contactsCopy: '1 hiring-manager contact per job, from a limited lifetime credit pool.',
    resumeCopy: 'Locked — upgrade to unlock personalized resume advice.',
    interviewCopy: '3 practice questions a day.',
    avatars: [{ delay: 0 }],
    s5Headline: "You're set — here's your first search",
    s5Body: 'Jump in and run your first manual search now.',
  },
  core: {
    s2Headline: 'Unlimited automated daily job matching',
    s2Body: 'We scan the market for you every day and drop new matches straight into your inbox.',
    digestOptions: [
      { label: 'Daily', active: '#2F6ECC', color: 'white' },
      { label: 'Weekly', active: '#D6E4FA', color: '#2F6ECC' },
    ],
    s3Headline: 'A sponsorship score on every job',
    s3Body: 'Full sponsorship badges with a heuristic-based score, visible on every match.',
    contactsCopy: 'Up to 2 hiring-manager contacts per job, 5 lookups a day.',
    resumeCopy: 'Full resume advice, 5 reviews a day.',
    interviewCopy: 'Unlimited practice questions.',
    avatars: [{ delay: 0 }, { delay: 0.15 }],
    s5Headline: "You're all set — your first matches are on the way",
    s5Body: "We're already scanning. Check your inbox for your first daily digest.",
  },
  premium: {
    s2Headline: 'Unlimited automated matching, delivered instantly',
    s2Body: "Matches land in your inbox the moment they're found — no waiting for a daily batch.",
    digestOptions: [
      { label: 'Instant', active: '#2F6ECC', color: 'white' },
      { label: 'Daily', active: '#D6E4FA', color: '#2F6ECC' },
    ],
    s3Headline: 'Real Sponsorship Score, verified',
    s3Body: "Scores are built on verified filing data, plus Sponsor Watch — real-time alerts when a company's H-1B filing volume changes.",
    contactsCopy: 'Up to 3 seniority-ranked contacts per job, 20 lookups a day.',
    resumeCopy: 'Full resume advice, 20 reviews a day.',
    interviewCopy: 'Unlimited practice questions.',
    avatars: [{ delay: 0 }, { delay: 0.15 }, { delay: 0.3 }],
    s5Headline: "You're all set — your first matches are on the way",
    s5Body: 'Instant matching is live and Sponsor Watch is already scanning your saved companies.',
  },
}

const WELCOME_TEXT = "Welcome to Job-Hopper — let's find you a job that sponsors visas."
const SKILL_CHIPS = [
  { label: 'React', delay: 0.1 },
  { label: 'Figma', delay: 0.5 },
  { label: 'SQL', delay: 0.9 },
  { label: 'Leadership', delay: 1.3 },
]
const PARTICLES = [
  { left: 10, delay: 0 },
  { left: 35, delay: 0.5 },
  { left: 60, delay: 1 },
  { left: 85, delay: 1.5 },
]

const slide = ref(0)
const t = computed(() => COPY_BY_TIER[props.tier])
const dots = computed(() =>
  Array.from({ length: TOTAL_SLIDES }, (_, i) => (i <= slide.value ? '#2F6ECC' : '#E5E7EB')),
)
const isLastSlide = computed(() => slide.value === TOTAL_SLIDES - 1)
const nextLabel = computed(() => (isLastSlide.value ? 'Get Started' : 'Next'))

function onNext() {
  if (!isLastSlide.value) {
    slide.value++
    return
  }
  emit('complete')
}

function onBack() {
  if (slide.value > 0) slide.value--
}

function onSkip() {
  emit('skip')
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('skip')
}

onMounted(() => {
  lockBodyScroll()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  unlockBodyScroll()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="wt-overlay" role="dialog" aria-modal="true" aria-label="Welcome walkthrough">
      <div class="wt-blob wt-blob-a" />
      <div class="wt-blob wt-blob-b" />
      <div class="wt-blob wt-blob-c" />

      <div class="wt-card">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:24px;">
          <div style="display:flex; gap:6px; flex:1;">
            <div
              v-for="(color, i) in dots"
              :key="i"
              :style="{ background: color }"
              style="height:5px; flex:1; border-radius:12px; transition:background 0.3s;"
            />
          </div>
          <a href="#" class="wt-skip" @click.prevent="onSkip">Skip</a>
        </div>

        <div style="min-height:360px; display:flex; flex-direction:column;">
          <!-- Slide 0: Welcome -->
          <div
            v-if="slide === 0"
            style="display:flex; flex-direction:column; align-items:center; text-align:center; flex:1; justify-content:center;"
          >
            <div style="width:60px; height:60px; border-radius:12px; background:linear-gradient(135deg,#FFD75A,#FF8A34); display:flex; align-items:center; justify-content:center; margin-bottom:20px;">
              <font-awesome-icon :icon="['fas', 'compass']" style="font-size:26px; color:white;" />
            </div>
            <h1
              class="wt-fade-rise"
              style="font-family:'Poppins',sans-serif; font-weight:700; font-size:24px; color:#111827; margin:0 0 12px; line-height:1.4; min-height:70px; max-width:440px;"
            >
              {{ WELCOME_TEXT }}
            </h1>
            <p style="font-size:15px; color:#6B7280; line-height:1.55; margin:0; max-width:420px;">
              We match you to visa-sponsoring roles automatically, connect you to the actual hiring managers, and sharpen your resume — so you spend less time applying into the void.
            </p>
          </div>

          <!-- Slide 1: Job Matching -->
          <div v-else-if="slide === 1" style="flex:1; display:flex; flex-direction:column; justify-content:center;">
            <div style="position:relative; width:64px; height:64px; margin-bottom:18px;">
              <div style="width:52px; height:52px; border-radius:12px; background:#EAF1FC; display:flex; align-items:center; justify-content:center;">
                <font-awesome-icon :icon="['fas', 'envelope']" style="font-size:22px; color:#2F6ECC;" />
              </div>
              <div
                v-if="tier === 'free'"
                class="wt-counter-pulse"
                style="position:absolute; top:-8px; right:-10px; background:#2F6ECC; color:white; font-size:11px; font-weight:700; padding:3px 7px; border-radius:12px;"
              >
                3
              </div>
              <div
                v-else
                style="position:absolute; top:-6px; right:-10px; width:22px; height:22px; border-radius:50%; background:white; border:1px solid #DCE8FB; display:flex; align-items:center; justify-content:center;"
              >
                <font-awesome-icon :icon="['fas', 'arrows-rotate']" class="wt-spin" style="font-size:11px; color:#2F6ECC;" />
              </div>
              <div class="wt-envelope-slide" style="position:absolute; left:6px; top:-14px; width:10px; height:7px; background:#2F6ECC; border-radius:2px;" />
            </div>
            <h2 class="wt-heading">{{ t.s2Headline }}</h2>
            <p class="wt-body">{{ t.s2Body }}</p>

            <div
              v-if="tier === 'free'"
              style="background:#F9FAFB; border:1px dashed #D1D5DB; border-radius:12px; padding:14px 16px; font-size:13px; color:#6B7280;"
            >
              <font-awesome-icon :icon="['fas', 'arrow-up-right-dots']" style="margin-right:6px;" />Upgrade for daily automated matching — no manual runs needed.
            </div>
            <div
              v-else
              style="background:#EAF1FC; border:1px solid #DCE8FB; border-radius:12px; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; gap:12px;"
            >
              <div style="font-size:13px; color:#374151; font-weight:600;">Digest delivery</div>
              <div style="display:flex; gap:6px;">
                <span
                  v-for="opt in t.digestOptions"
                  :key="opt.label"
                  :style="{ background: opt.active, color: opt.color }"
                  style="padding:6px 12px; border-radius:12px; font-size:12px; font-weight:700;"
                >
                  {{ opt.label }}
                </span>
              </div>
            </div>
          </div>

          <!-- Slide 2: Sponsorship Confidence -->
          <div v-else-if="slide === 2" style="flex:1; display:flex; flex-direction:column; justify-content:center;">
            <div style="position:relative; width:60px; height:60px; margin-bottom:18px; display:flex; align-items:center; justify-content:center;">
              <div
                v-if="tier === 'premium'"
                class="wt-radar-sweep"
                style="position:absolute; width:60px; height:60px; border-radius:50%; background:conic-gradient(from 0deg, rgba(47,110,204,0.35), transparent 70%);"
              />
              <div class="wt-pulse-ring" style="width:52px; height:52px; border-radius:12px; background:#EAF1FC; display:flex; align-items:center; justify-content:center;">
                <font-awesome-icon :icon="['fas', 'shield-halved']" style="font-size:22px; color:#2F6ECC;" />
              </div>
            </div>
            <h2 class="wt-heading">{{ t.s3Headline }}</h2>
            <p class="wt-body">{{ t.s3Body }}</p>

            <div v-if="tier === 'free'" style="position:relative; display:inline-block; align-self:flex-start;">
              <span style="display:inline-flex; align-items:center; gap:6px; background:#FFF4E0; color:#B45309; font-size:13px; font-weight:600; padding:8px 14px; border-radius:12px; filter:blur(4px); user-select:none;">
                Sponsor: likely (est.)
              </span>
              <span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
                <font-awesome-icon :icon="['fas', 'lock']" style="font-size:13px; color:#111827;" />
              </span>
            </div>
            <span
              v-else-if="tier === 'core'"
              style="display:inline-flex; align-items:center; gap:6px; background:#FFF4E0; color:#B45309; font-size:13px; font-weight:700; padding:8px 14px; border-radius:12px; align-self:flex-start;"
            >
              <font-awesome-icon :icon="['fas', 'certificate']" /> Sponsor: likely — 82%
            </span>
            <div v-else style="display:flex; flex-direction:column; gap:8px; align-self:flex-start;">
              <span style="display:inline-flex; align-items:center; gap:6px; background:#FFF4E0; color:#B45309; font-size:13px; font-weight:700; padding:8px 14px; border-radius:12px;">
                <font-awesome-icon :icon="['fas', 'certificate']" /> Real Sponsorship Score — 94
              </span>
              <span style="display:inline-flex; align-items:center; gap:6px; background:#EAF1FC; color:#2F6ECC; font-size:13px; font-weight:700; padding:8px 14px; border-radius:12px;">
                <font-awesome-icon :icon="['fas', 'satellite-dish']" /> Sponsor Watch enabled
              </span>
            </div>
          </div>

          <!-- Slide 3: Hiring Intel & Resume Tools -->
          <div v-else-if="slide === 3" style="flex:1; display:flex; flex-direction:column; justify-content:center;">
            <h2 class="wt-heading" style="margin-bottom:14px;">Reach the people who hire</h2>
            <div style="display:flex; margin-bottom:16px;">
              <div
                v-for="(av, i) in t.avatars"
                :key="i"
                class="wt-slide-in-card"
                :style="{ animationDelay: `${av.delay}s`, marginLeft: i === 0 ? '0' : '-10px' }"
                style="width:42px; height:42px; border-radius:50%; background:#EAF1FC; border:2px solid white; box-shadow:0 2px 6px rgba(17,24,39,0.1); display:flex; align-items:center; justify-content:center;"
              >
                <font-awesome-icon :icon="['fas', 'user']" style="font-size:15px; color:#2F6ECC;" />
              </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div style="background:#EAF1FC; border-radius:12px; padding:14px 16px;">
                <div style="font-size:12px; color:#2F6ECC; font-weight:700; margin-bottom:4px;">HIRING CONTACTS</div>
                <div style="font-size:14px; color:#374151; line-height:1.4;">{{ t.contactsCopy }}</div>
              </div>
              <div style="background:#EAF1FC; border-radius:12px; padding:14px 16px; position:relative;">
                <div style="font-size:12px; color:#2F6ECC; font-weight:700; margin-bottom:4px;">RESUME ADVICE</div>
                <template v-if="tier === 'free'">
                  <div style="font-size:14px; color:#374151; filter:blur(3px); user-select:none; line-height:1.4;">
                    Tailor your bullet to match key terms for stronger ATS parsing
                  </div>
                  <span style="position:absolute; top:14px; right:14px;">
                    <font-awesome-icon :icon="['fas', 'lock']" style="font-size:13px; color:#111827;" />
                  </span>
                </template>
                <div v-else style="font-size:14px; color:#374151; line-height:1.4;">
                  {{ t.resumeCopy }}<font-awesome-icon :icon="['fas', 'circle-check']" style="color:#16A34A; margin-left:6px;" />
                </div>
              </div>
            </div>
          </div>

          <!-- Slide 4: Prep & Practice -->
          <div v-else-if="slide === 4" style="flex:1; display:flex; flex-direction:column; justify-content:center;">
            <h2 class="wt-heading" style="margin-bottom:6px;">Prep &amp; Practice</h2>
            <p style="font-size:14px; color:#4B5563; line-height:1.5; margin:0 0 14px;">
              See which skills your resume covers, which are missing, and get course recs to close the gap.
            </p>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px;">
              <span
                v-for="chip in SKILL_CHIPS"
                :key="chip.label"
                class="wt-chip-fill"
                :style="{ animationDelay: `${chip.delay}s` }"
                style="padding:7px 14px; border-radius:12px; font-size:13px; font-weight:600;"
              >
                {{ chip.label }}
              </span>
            </div>
            <div style="background:#F9FAFB; border:1px solid #E5E7EB; border-radius:12px; padding:14px 16px;">
              <div style="font-size:12px; color:#2F6ECC; font-weight:700; margin-bottom:8px;">
                <font-awesome-icon :icon="['fas', 'comment-dots']" /> MOCK INTERVIEW PRACTICE
              </div>
              <div style="display:flex; flex-direction:column; gap:6px;">
                <div
                  class="wt-bubble-in"
                  style="align-self:flex-start; background:#EAF1FC; color:#111827; font-size:13px; padding:8px 12px; border-radius:12px; animation-delay:0.2s;"
                >
                  Tell me about a time you led a project.
                </div>
                <div
                  class="wt-bubble-in"
                  style="align-self:flex-end; background:#2F6ECC; color:white; font-size:13px; padding:8px 12px; border-radius:12px; animation-delay:0.7s;"
                >
                  Great answer — try quantifying the outcome.
                </div>
              </div>
              <div style="font-size:13px; color:#6B7280; margin-top:10px;">{{ t.interviewCopy }}</div>
            </div>
          </div>

          <!-- Slide 5: Wrap-up -->
          <div
            v-else
            style="display:flex; flex-direction:column; align-items:center; text-align:center; flex:1; justify-content:center; position:relative;"
          >
            <div style="width:60px; height:60px; border-radius:12px; background:#DCFCE7; display:flex; align-items:center; justify-content:center; margin-bottom:20px;">
              <font-awesome-icon :icon="['fas', 'circle-check']" style="font-size:26px; color:#16A34A;" />
            </div>
            <h1 style="font-family:'Poppins',sans-serif; font-weight:700; font-size:22px; color:#111827; margin:0 0 12px; line-height:1.3;">
              {{ t.s5Headline }}
            </h1>
            <p style="font-size:15px; color:#6B7280; line-height:1.55; margin:0 0 8px; max-width:420px;">{{ t.s5Body }}</p>
            <div
              v-if="tier === 'free'"
              style="margin-top:10px; background:#FFF4E0; border-radius:12px; padding:10px 16px; font-size:13px; color:#7A5320; font-weight:500;"
            >
              Upgrading unlocks daily automated matching, anytime.
            </div>
            <div
              v-else-if="tier === 'premium'"
              style="margin-top:10px; background:#EAF1FC; border-radius:12px; padding:10px 16px; font-size:13px; color:#2F6ECC; font-weight:600;"
            >
              <font-awesome-icon :icon="['fas', 'satellite-dish']" /> Sponsor Watch is armed for your saved companies.
            </div>
          </div>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:24px; gap:12px; position:relative;">
          <a href="#" class="wt-back" :style="{ visibility: slide === 0 ? 'hidden' : 'visible' }" @click.prevent="onBack">← Back</a>
          <div style="position:relative; display:inline-flex;">
            <template v-if="isLastSlide">
              <div
                v-for="(p, i) in PARTICLES"
                :key="i"
                class="wt-particle"
                :style="{ left: `${p.left}%`, animationDelay: `${p.delay}s` }"
              />
              <div class="wt-cta-glow" />
            </template>
            <a href="#" class="wt-next-btn" @click.prevent="onNext">{{ nextLabel }}</a>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.wt-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  overflow: hidden;
  background: radial-gradient(circle at 20% 15%, #FFE8CF 0%, #FFF7ED 45%, #FFF7ED 100%);
}

.wt-blob {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.wt-blob-a {
  top: -100px;
  left: -80px;
  width: 320px;
  height: 320px;
  filter: blur(10px);
  background: radial-gradient(circle, rgba(255, 215, 90, 0.55), rgba(255, 138, 52, 0.25) 70%, transparent 100%);
  animation: wtFloatBlobA 9s ease-in-out infinite;
}

.wt-blob-b {
  bottom: -120px;
  right: -60px;
  width: 380px;
  height: 380px;
  filter: blur(12px);
  background: radial-gradient(circle, rgba(255, 138, 52, 0.4), rgba(255, 215, 90, 0.2) 70%, transparent 100%);
  animation: wtFloatBlobB 11s ease-in-out infinite;
}

.wt-blob-c {
  top: 40%;
  right: 8%;
  width: 180px;
  height: 180px;
  filter: blur(8px);
  background: radial-gradient(circle, rgba(255, 215, 90, 0.4), transparent 70%);
  animation: wtFloatBlobC 8s ease-in-out infinite;
}

.wt-card {
  width: 100%;
  max-width: 580px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 12px;
  box-shadow: 0 24px 60px -20px rgba(17, 24, 39, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.6);
  padding: 34px 38px 30px;
  position: relative;
  z-index: 2;
  box-sizing: border-box;
}

.wt-skip {
  font-size: 13px;
  font-weight: 600;
  color: #6B7280;
  text-decoration: none;
  white-space: nowrap;
}

.wt-heading {
  font-family: 'Poppins', sans-serif;
  font-weight: 700;
  font-size: 21px;
  color: #111827;
  margin: 0 0 10px;
}

.wt-body {
  font-size: 15px;
  color: #4B5563;
  line-height: 1.55;
  margin: 0 0 18px;
}

.wt-back {
  font-size: 14px;
  font-weight: 600;
  color: #6B7280;
  text-decoration: none;
}

.wt-next-btn {
  position: relative;
  z-index: 1;
  background: #2F6ECC;
  color: white;
  padding: 11px 26px;
  border-radius: 12px;
  text-decoration: none;
  font-weight: 700;
  font-size: 14px;
  border: 1px solid #2F6ECC;
  transition: background 0.2s, color 0.2s;
}

.wt-next-btn:hover {
  background: white;
  color: #2F6ECC;
}

.wt-fade-rise {
  opacity: 0;
  animation: wtFadeRiseWord 0.6s ease forwards;
  animation-delay: 0.1s;
}

.wt-counter-pulse {
  animation: wtCounterPulse 1.8s ease-in-out infinite;
}

.wt-spin {
  animation: wtSpinIcon 2.4s linear infinite;
}

.wt-envelope-slide {
  opacity: 0;
  animation: wtEnvelopeSlide 2.4s ease-in-out infinite;
}

.wt-pulse-ring {
  animation: wtPulseRing 2.4s ease-out infinite;
}

.wt-radar-sweep {
  animation: wtRadarSweep 3s linear infinite;
}

.wt-slide-in-card {
  opacity: 0;
  animation: wtSlideInCard 0.45s ease forwards;
}

.wt-chip-fill {
  animation: wtChipFill 0.6s ease forwards;
}

.wt-bubble-in {
  opacity: 0;
  animation: wtBubbleIn 0.5s ease forwards;
}

.wt-particle {
  position: absolute;
  bottom: 6px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: linear-gradient(135deg, #FFD75A, #FF8A34);
  animation: wtParticleFloat 2.2s ease-in-out infinite;
}

.wt-cta-glow {
  position: absolute;
  inset: -10px;
  border-radius: 16px;
  background: radial-gradient(circle, rgba(255, 138, 52, 0.35), transparent 70%);
  animation: wtCtaGlow 2.4s ease-in-out infinite;
  z-index: 0;
}

@keyframes wtFloatBlobA {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(40px, -30px); }
}

@keyframes wtFloatBlobB {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-30px, 25px); }
}

@keyframes wtFloatBlobC {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(20px, 30px); }
}

@keyframes wtFadeRiseWord {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes wtPulseRing {
  0% { box-shadow: 0 0 0 0 rgba(47, 110, 204, 0.35); }
  70% { box-shadow: 0 0 0 14px rgba(47, 110, 204, 0); }
  100% { box-shadow: 0 0 0 0 rgba(47, 110, 204, 0); }
}

@keyframes wtSpinIcon {
  to { transform: rotate(360deg); }
}

@keyframes wtRadarSweep {
  to { transform: rotate(360deg); }
}

@keyframes wtCounterPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}

@keyframes wtSlideInCard {
  from { opacity: 0; transform: translateX(-14px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes wtChipFill {
  0% { background: #FFF4E0; color: #B45309; }
  100% { background: #DCFCE7; color: #15803D; }
}

@keyframes wtBubbleIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes wtCtaGlow {
  0%, 100% { opacity: 0.45; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(1.08); }
}

@keyframes wtParticleFloat {
  0% { transform: translateY(0); opacity: 0; }
  25% { opacity: 1; }
  100% { transform: translateY(-50px); opacity: 0; }
}

@keyframes wtEnvelopeSlide {
  0% { transform: translateY(-8px); opacity: 0; }
  35% { opacity: 1; }
  100% { transform: translateY(10px); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .wt-overlay *,
  .wt-overlay *::before,
  .wt-overlay *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
