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
    a: "It's a fast, heuristic estimate—built from employer size, industry, and role signals—that helps you quickly prioritize roles where sponsorship is more plausible, without digging through each posting. On Free you see a teaser; Core unlocks the full badge on every match. It's a smart filter, not a guarantee—no badge can tell you for certain whether a specific employer will sponsor. If you want something backed by real government filing data instead of a heuristic, that's what our upcoming Real Sponsorship Score (Premium) is built for—join the waitlist to get early access."
  },
  {
    q: "How does the free trial work?",
    a: "Core starts with a free trial, so you can see the quality of your matches before being charged—cancel anytime before it ends and you won't pay. Free requires no card and has no trial period since it's free to use indefinitely. Premium isn't purchasable yet, so there's no trial for it—join the waitlist to get access when it launches."
  },
  {
    q: "Is Resume Advice included, or is it a paid add-on?",
    a: "Full Resume Advice is included in Core—not a separate purchase. Free gets a teaser version. The one-time resume upgrade and per-job resume tailoring are separate paid add-ons on top of whichever plan you're on."
  },
  {
    q: "Why are there different plans?",
    a: "Plans differ in how much Job-Hopper automates for you—not by seniority or job type. Free lets you search manually with capped access and teaser insights. Core adds unlimited automated matching, daily email digests, full insights, full resume advice, and an application tracker. Premium (coming soon) layers on a deeper sponsorship intelligence set."
  },
  {
    q: "Do higher-priced tiers come with different features?",
    a: "Yes—that's the main difference between plans. Core unlocks unlimited automated daily search, full sponsorship insights, full resume advice, and the application tracker, all of which are limited or teaser-only on Free. Premium will add deeper sponsorship intelligence—Real Sponsorship Score, Sponsor Watch, Apply Intelligence, hiring manager contacts, and the Ghost Listing Detector—on top of everything in Core."
  },
  {
    q: "Can I change plans later?",
    a: "Yes. You can upgrade or downgrade between Free, Core, and Premium (once Premium is available) from your account settings at any time. Changes typically apply to your next billing cycle."
  },
  {
    q: "Do I have to upgrade to Core to get value?",
    a: "No—Free gets you manual search with capped access and a preview of what Core unlocks. But Core is where the automation actually runs for you: unlimited daily matching, full insights, and the application tracker. Most people upgrade once they've seen a few matches and want it running automatically."
  },
  {
    q: "Do I need a credit card to sign up?",
    a: "No. Free requires no card at all—you can start using Job-Hopper immediately. A card is only needed when you choose to upgrade to Core."
  },
  {
    q: "What happens when I hit my search limit on Free?",
    a: "Free gives you 3 manual job searches. Once you use them, you'll see the option to upgrade to Core, which removes the cap entirely and switches you to unlimited automated daily search—no more manually re-running searches."
  },
  {
    q: "What's the real difference between Free and Core?",
    a: "Free lets you look around: manual search with a cap, a teaser of the sponsorship badge, a few visible Premium Insights fields, and a preview of Resume Advice. Core removes the ceiling—unlimited automated daily search with an email digest, the full sponsorship badge on every match, full Premium Insights, full Resume Advice, and the application tracker to keep track of where you've applied. If you're serious about your search, Core is where Job-Hopper actually starts working for you instead of you working it."
  },
  {
    q: "How do I upgrade from Free to Core?",
    a: "From your dashboard, go to your account settings and select Upgrade to Core. You'll get unlimited automated search and full access to every feature immediately—no waiting for the next billing cycle to start using it."
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your account settings whenever you want—no minimum commitment. If you cancel Core, you'll keep access through the end of your current billing period, then drop back to Free rather than losing your account entirely."
  },
  {
    q: "Will I lose my matches or saved jobs if I switch plans?",
    a: "No. Your account, profile, and saved job history stay in place whether you're on Free or Core. If you downgrade from Core to Free, your tracked applications aren't deleted—the application tracker view just isn't part of the Free plan, so you won't see it in your dashboard until you upgrade again, at which point everything reappears."
  },
  {
    q: "Is Premium worth waiting for?",
    a: "If sponsorship likelihood matters a lot to your search, yes—Premium is built specifically for that. It layers a Real Sponsorship Score backed by actual filing data on top of everything Core already gives you, plus Sponsor Watch (alerts on employer filing activity), Apply Intelligence, hiring manager contacts, and the Ghost Listing Detector. It's not purchasable yet—join the waitlist from the Pricing page to get early access the moment it launches."
  },
  {
    q: "I'm not sure Core is worth it yet—what should I do?",
    a: "Start on Free and see the quality of your matches firsthand—there's no card required and no time pressure. When you're ready to stop manually re-running searches and want the full sponsorship badge, insights, and tracker running automatically, upgrading to Core takes one click and applies immediately."
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

