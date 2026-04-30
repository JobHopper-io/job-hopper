<script setup lang="ts">
import { ref } from 'vue'

const faqOpen = ref<number | null>(null)

const toggleFaq = (index: number) => {
  faqOpen.value = faqOpen.value === index ? null : index
}

const faqs = [
  {
    q: "What is Job-Hopper?",
    a: "Job-Hopper is a subscription-based job matching service and web app built for job seekers—not employers. Think of it as the AI tool that does your job search for you: we continuously scan and curate roles from across the web, then use your profile, preferences, and career level to deliver only the opportunities that make sense for you."
  },
  {
    q: "How is this different from job boards like Indeed or LinkedIn?",
    a: "Most job boards are funded by and built to serve the interests of employers. Companies pay to post or promote roles, and candidates do the heavy lifting—searching, applying, and hoping something sticks. Job-Hopper flips that model. Because our service is paid for by subscribers, we work exclusively on your behalf: we filter and enrich roles, screen out obvious 'ghost' or low-activity postings, and match only the best fits to your profile so you're not stuck sorting through endless noise."
  },
  {
    q: "Who pays for Job-Hopper—and whose side are you on?",
    a: "Job-Hopper is paid for by job seekers through subscriptions, not by employers. That means our incentives are aligned with you. Our job is to save you time, cut down on wasted effort, and surface quality roles that are actually worth your attention—not to drive more clicks or applicants to paid job ads."
  },
  {
    q: "Do you apply to jobs for me?",
    a: "No. You stay in control of your applications. Job-Hopper surfaces opportunities and context for each role, and you decide where, how, and when to apply."
  },
  {
    q: "Can you guarantee I'll get a job?",
    a: "We can't guarantee a specific outcome—no honest service can. What we can do is save you time, reduce frustration, and dramatically improve the quality, timing, and relevance of the roles you pursue."
  },
  {
    q: "Where do the jobs come from?",
    a: "We pull from public job boards, direct company career pages, and other online sources. Our automation engine continuously scans for new postings, then our rules and team review them for freshness, legitimacy, and signs of real hiring activity before they ever reach your feed."
  },
  {
    q: "Is Job-Hopper only for certain industries?",
    a: "No. Job-Hopper is built for anyone in the United States who is serious about their next move. Our automation engine searches and matches across industries from your profile and preferences. We add extra human vetting where we see the densest, noisiest markets—today that includes manufacturing and tech, especially analytics and engineering-heavy roles—so matches stay sharp. For other fields (healthcare, retail leadership, logistics, professional services, and more) the same engine still works effectively; niche or highly unusual titles may see fewer postings simply because the market is thinner, but we keep searching on your behalf."
  },
  {
    q: "Which industries do you cover today?",
    a: "Today the product spans the economy—from desk jobs to the plant floor and everything in between. We are seeing standout results for people in tech and manufacturing, particularly analytics and engineering paths such as Data Analyst, Systems Analyst, Full Stack Developer, Mechanical Engineer, Process Engineer, Supply Chain Analyst, Manufacturing Systems Analyst, and IT Support Specialist. In those busy segments we pair AI matching with extra human review to keep signal high. Healthcare, logistics, retail leadership, professional services, and other sectors already run on the same engine, and we keep deepening coverage as we grow."
  },
  {
    q: "Which locations do you support?",
    a: "Currently, Job-Hopper focuses on roles based in the United States. In your profile, you can set preferred locations, indicate whether you're open to relocation, include or exclude remote options, and adjust those settings anytime."
  },
  {
    q: "How often will I get new matches?",
    a: "It depends on your profile, preferences, and the current market. Many users see new matches weekly. Our priority is quality over volume, so you may receive a smaller number of strong, well-matched opportunities rather than a constant stream of random postings."
  },
  {
    q: "Can I change my preferences later?",
    a: "Yes. You can update your target roles, salary expectations, locations, industries of interest, and other settings at any time from your Job-Hopper dashboard. Your future matches will automatically adjust as you refine your profile."
  },
  {
    q: "What is the sponsorship-likelihood signal?",
    a: "For roles that flow through the Hopper, Job-Hopper runs thorough analysis of posting and employer metadata to produce a sponsorship-likelihood estimate—useful when you need to prioritize openings where employer visa sponsorship (for example H-1B) is more plausible. It is a filter and a time-saver, not a guarantee that any specific role or company will sponsor. Many subscribers never turn it on; it is there when your situation calls for it."
  },
  {
    q: "How does the free trial work?",
    a: "Every base plan starts with a free trial. During the trial, you get access to your job feed and email alerts so you can judge the quality and relevance of your matches for yourself. If you don't want to continue, simply cancel before the trial ends and you won't be charged."
  },
  {
    q: "Are resume add-ons included in the free trial?",
    a: "Your free trial focuses on the core Job-Hopper experience: curated matches, your personal feed, and email alerts. Optional resume services—such as a one-time resume upgrade or per-job tailoring—are billed separately when you purchase them."
  },
  {
    q: "Why are there different base plans?",
    a: "Base plans are priced by role level and job type—not by features. Entry & Mid Level, Senior & Management, and Director/VP/C-Level plans all include the same core service. The pricing reflects the level of roles you're targeting and the narrower, more specialized searches that occur at higher tiers."
  },
  {
    q: "Do higher-priced tiers come with different features?",
    a: "No. All three tiers share the same core Job-Hopper experience: curated matches, your job feed, and email delivery of new opportunities. Optional resume services are separate add-ons you can purchase when you want them."
  },
  {
    q: "Can I change plans later?",
    a: "Yes. If your career level or target roles change—for example, you move from mid-level to management or step into an executive search—you can upgrade or downgrade your base plan from your account settings. Changes typically apply to the next billing cycle."
  },
  {
    q: "Do I have to buy add-ons to get value?",
    a: "No. The base plans are designed to stand on their own. Most users will see strong value from curated, well-matched opportunities alone. Resume add-ons are there if you want help refreshing your resume or tailoring it for a specific role."
  },
  {
    q: "What happens if I find a job?",
    a: "First—congratulations. You can cancel your subscription in a couple of clicks or keep it active if you want to stay aware of future opportunities or quietly monitor the market. Many users pause, then come back when they're ready for their next move."
  },
  {
    q: "Do employers see my profile?",
    a: "No. Job-Hopper is not a public candidate database, and we do not give employers access to browse or search your profile. We use your information internally to power matching and recommendations. If we ever introduce features that allow selective visibility to employers, they will be strictly opt-in and under your control."
  },
  {
    q: "Do you share my data with employers or third parties?",
    a: "No. We do not share your personal profile data with employers or sell it to third-party advertisers. Any information an employer receives about you comes directly from you—through the applications you choose to submit and any outreach you decide to send. Our role is to help you find and prioritize opportunities, not to trade on your data."
  },
  {
    q: "How do you protect my data?",
    a: "We use industry-standard security practices to safeguard your information and we never sell your personal data to advertisers. Your profile exists to help us match you with better jobs—nothing else. For full details on how we handle and protect your information, see our Privacy Policy."
  },
  {
    q: "I still have questions—how do I contact you?",
    a: "You can reach us anytime at support@job-hopper.io or by using the contact form on our Support page. We typically respond within 1–2 business days."
  }
]
</script>

<template>
  <div class="min-h-screen bg-white py-20 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-brand-charcoal mb-12 text-center">
        Frequently Asked Questions
      </h1>
      <div class="space-y-4">
        <div v-for="(item, index) in faqs" :key="index" class="card">
          <button
            @click="toggleFaq(index)"
            class="w-full text-left p-6 flex justify-between items-start hover:bg-neutral-bg transition-colors"
          >
            <span class="font-semibold text-brand-charcoal pr-4">{{ item.q }}</span>
            <svg
              :class="['w-5 h-5 text-neutral-body transition-transform flex-shrink-0 mt-1', faqOpen === index ? 'rotate-180' : '']"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>
          <div v-if="faqOpen === index" class="px-6 pb-6">
            <p class="text-neutral-body leading-relaxed">{{ item.a }}</p>
          </div>
        </div>
      </div>
      <div class="mt-12 text-center">
        <p class="text-neutral-body mb-4">
          Still have questions?
        </p>
        <router-link to="/support" class="btn-primary inline-block">
          Contact Support
        </router-link>
      </div>
    </div>
  </div>
</template>

