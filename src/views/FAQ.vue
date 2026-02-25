<script setup lang="ts">
import { ref } from 'vue'

const faqOpen = ref<number | null>(null)

const toggleFaq = (index: number) => {
  faqOpen.value = faqOpen.value === index ? null : index
}

const faqs = [
  {
    q: "What is Job-Hopper?",
    a: "Job-Hopper is a subscription-based job matching service and web app built for job seekers—not employers. We continuously scan and curate roles from across the web, then use your profile, preferences, and career level to send you only the opportunities that make sense for you."
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
    a: "No. You stay in control of your applications. Job-Hopper surfaces opportunities, provides context and (optionally) premium contact and prep insights, and you decide where, how, and when to apply."
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
    q: "Is Job-Hopper only for manufacturing professionals?",
    a: "Job-Hopper is built to work for all job seekers, and it performs especially well for manufacturing, industrial, and related roles. Our automation engine actively searches and matches across industries based on your profile and preferences. Right now, our human team focuses the majority of manual vetting and curation on manufacturing and industrial jobs to keep quality extremely high in that space. For other common roles—like nurses, office staff, retail managers, banking, construction, hospitality, and more—the automation engine still works very effectively, but there may be less human oversight than for manufacturing positions. Highly obscure or unusual roles may naturally generate fewer matches, but the system will still search on your behalf."
  },
  {
    q: "Which industries do you cover today?",
    a: "Our initial core is manufacturing and industrial roles in the United States—everything from entry-level plant-floor positions to engineering, management, and executive leadership. That said, Job-Hopper can also support a wide range of more common roles outside manufacturing (for example: healthcare, admin/office, construction, logistics, retail and hospitality, banking, and similar fields) through our automation engine. As the platform grows, we'll expand formal, human-curated coverage into additional industries—without compromising quality."
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
    q: "How does the free trial work?",
    a: "Every base plan starts with a free trial. During the trial, you get access to your job feed and email alerts so you can judge the quality and relevance of your matches for yourself. If you don't want to continue, simply cancel before the trial ends and you won't be charged."
  },
  {
    q: "Are premium add-ons included in the free trial?",
    a: "Your free trial focuses on the core Job-Hopper experience: curated matches, your personal feed, and email alerts. Premium features—such as hiring contact insights, interview prep tools, and resume upgrades—are optional add-ons that are billed separately once you choose to enable them."
  },
  {
    q: "Why are there different base plans?",
    a: "Base plans are priced by role level and job type—not by features. Entry & Mid Level, Senior & Management, and Director/VP/C-Level plans all include the same core service. The pricing reflects the level of roles you're targeting and the narrower, more specialized searches that occur at higher tiers."
  },
  {
    q: "Do higher-priced tiers come with different features?",
    a: "No. All three tiers share the same core Job-Hopper experience: curated matches, your job feed, and email delivery of new opportunities. Optional upgrades like contact insights, interview prep, and resume improvements are separate add-ons you can attach to any plan."
  },
  {
    q: "Can I change plans later?",
    a: "Yes. If your career level or target roles change—for example, you move from mid-level to management or step into an executive search—you can upgrade or downgrade your base plan from your account settings. Changes typically apply to the next billing cycle."
  },
  {
    q: "Do I have to buy add-ons to get value?",
    a: "No. The base plans are designed to stand on their own. Most users will see strong value from curated, well-matched opportunities alone. Add-ons are there if you want extra support with outreach, interview strategy, or refreshing your resume."
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

