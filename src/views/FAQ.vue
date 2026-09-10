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
    q: "What is the sponsorship badge, and how accurate is it?",
    a: "It's a fast, heuristic estimate—built from employer size, industry, and role signals—that helps you quickly prioritize roles where sponsorship is more plausible, without digging through each posting. Every plan includes the full badge on every match. It's a smart filter, not a guarantee—no badge can tell you for certain whether a specific employer will sponsor. If you want something backed by real government filing data instead of a heuristic, that's what the Real Sponsorship Score on Premium is built for."
  },
  {
    q: "How does the free trial work?",
    a: "Core and Premium both start with a 14-day free trial. You add a card up front and aren't charged until the trial ends, so you can see the quality and relevance of your matches before you commit. Cancel anytime before the trial ends and you won't pay."
  },
  {
    q: "Is Resume Advice included, or is it a paid add-on?",
    a: "Full Resume Advice is included in Core and Premium—not a separate purchase. The one-time resume upgrade and per-job resume tailoring are separate paid add-ons on top of whichever plan you're on."
  },
  {
    q: "Why are there different plans?",
    a: "Plans differ in how much Job-Hopper automates for you—not by seniority or job type. Core gives you unlimited automated matching, daily email digests, full insights, full resume advice, an application tracker, and hiring manager contact. Premium layers on a deeper sponsorship intelligence set."
  },
  {
    q: "Do higher-priced tiers come with different features?",
    a: "Yes. Core covers unlimited automated daily search, full sponsorship insights, full resume advice, the application tracker, and hiring manager contact. Premium adds deeper sponsorship intelligence—Real Sponsorship Score, Sponsor Watch, Apply Intelligence, and the Ghost Listing Detector—on top of everything in Core."
  },
  {
    q: "Can I change plans later?",
    a: "Yes. You can switch between Core and Premium from your account settings at any time. Changes typically apply to your next billing cycle."
  },
  {
    q: "Which plan should I start with?",
    a: "Most people start with Core—it runs the automation for you: unlimited daily matching, full insights, the application tracker, and hiring manager contact. Choose Premium if sponsorship likelihood is central to your search and you want the Real Sponsorship Score, Sponsor Watch, Apply Intelligence, and Ghost Listing Detector on top. Both start with a 14-day free trial, so you can try either before you're charged."
  },
  {
    q: "Do I need a credit card to sign up?",
    a: "Yes. Core and Premium both start with a 14-day free trial that requires a card, so billing can begin automatically when the trial ends. You won't be charged during the trial, and you can cancel anytime before it ends."
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your account settings whenever you want—no minimum commitment. If you cancel, you'll keep access through the end of your current billing period, then lose access to paid features; your account, profile, and saved job history stay in place."
  },
  {
    q: "Will I lose my matches or saved jobs if I switch plans?",
    a: "No. Your account, profile, and saved job history stay in place when you switch between Core and Premium. If you downgrade from Premium to Core, Premium-only views simply stop showing until you upgrade again, at which point everything reappears."
  },
  {
    q: "Is Premium worth it?",
    a: "If sponsorship likelihood matters a lot to your search, yes—Premium is built specifically for that. It layers a Real Sponsorship Score backed by actual filing data on top of everything Core already gives you, plus Sponsor Watch (alerts on employer filing activity), Apply Intelligence, and the Ghost Listing Detector. It also starts with a 14-day free trial, so you can see the difference before you commit."
  },
  {
    q: "I'm not sure which plan is worth it yet—what should I do?",
    a: "Start the 14-day free trial on Core. You add a card but aren't charged until it ends, and you can cancel anytime before then. Once you've seen a few matches with the full sponsorship badge, insights, and tracker running automatically, you'll know whether Core is enough or whether Premium's sponsorship intelligence is worth the step up."
  },
  {
    q: "What happens if I find a job?",
    a: "First—congratulations. You can cancel your subscription in a couple of clicks or keep it active if you want to stay aware of future opportunities or quietly monitor the market. Many users pause, then come back when they're ready for their next move."
  },
  {
    q: "Do employers see my profile?",
    a: "Only if you opt in, and only in anonymized form. Job-Hopper is not a public candidate database—your profile is invisible to employers by default. If you turn on Recruiter-Visible Mode, verified employers can find an anonymized version of your profile (role, career level, experience, and location—never your name, email, phone, resume, or current employer) in search. Your current employer is automatically excluded from ever seeing you in their results. An employer who wants to reach out has to send a reveal request naming the specific role and pay range; nothing identifying is shared until you personally approve that request."
  },
  {
    q: "Do you share my data with employers or third parties?",
    a: "Not without your say-so. We do not sell your personal profile data to third-party advertisers. If you've opted into Recruiter-Visible Mode, employers only ever see the anonymized search fields described above—no identifying details are shared until you approve a specific employer's reveal request, at which point that one employer gets your name and contact info so they can reach out. Any other information an employer receives about you comes directly from you—through applications you choose to submit or outreach you decide to send."
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
  <div class="min-h-screen bg-[#fff7ed] py-20 px-4 sm:px-6 lg:px-8">
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

