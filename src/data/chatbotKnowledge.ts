// src/data/chatbotKnowledge.ts
//
// Dedicated knowledge base for the RAG support chatbot ONLY.
// Not rendered anywhere on the public site - this is content written
// specifically to help the bot answer real user questions well, including
// frustration/complaint handling and conversion framing that doesn't belong
// on the public-facing FAQ page.
//
// Picked up by scripts/extract-support-docs.mjs under source_doc
// "chatbot_kb" - update that script to include this array when wiring in.

export const chatbotKnowledge = [
  // ---------- GHOST JOBS / TRUST / FRUSTRATION ----------
  {
    q: "Why do I still see ghost jobs or listings that never get filled?",
    a: "We actively filter for this — postings get screened for freshness and signs of real hiring activity before they reach your feed, and low-activity or obvious 'ghost' listings get excluded. It's not perfect; some slip through, especially on fast-moving boards. If a specific listing looks stale or fake to you, flagging it to support helps us improve filtering directly."
  },
  {
    q: "Why did I get a match that's clearly wrong for me?",
    a: "Matching looks at role alignment, experience level, location, and salary expectations — occasionally a posting slips through with misleading metadata (a job board mislabels seniority, or a title doesn't reflect the actual role). If a match seems off, that's useful signal — thumbs-down or feedback on the card helps refine future matches for your profile."
  },
  {
    q: "Why do I see the same job posted twice?",
    a: "Employers and job boards sometimes repost the same listing under slightly different titles or dates, which can make it through as a separate posting. Our filtering catches most of this, but not all of it — if you spot a clear duplicate, reporting it to support helps us tighten the filtering."
  },
  {
    q: "This feels like every other job board — how is it actually different?",
    a: "Most job boards are funded by employers paying to promote listings, so their incentive is more postings and more applicants, not better matches for you. Job-Hopper is paid for by subscribers, so the incentive is the opposite: fewer, better-vetted matches, not volume. That's also why we screen out low-quality and ghost postings instead of surfacing everything."
  },
  {
    q: "I'm frustrated I haven't found a job yet — is this actually working?",
    a: "No honest job search tool can guarantee an outcome — that's true of Job-Hopper too. What we can say is what we actually do: filter out low-quality and stale postings, match against your real profile instead of keyword-stuffing, and save you the time of manually searching five sites a night. If your matches consistently feel off, updating your profile preferences or reaching out to support is worth doing — the system improves with better signal from you."

  },

  // ---------- VISA / SPONSORSHIP NUANCE ----------
  {
    q: "Is the sponsorship badge based on real government data or a guess?",
    a: "The sponsorship badge on Core is a heuristic — built from employer size, industry, and role signals, not actual visa filing records. It's a useful filter, not a certified fact. Premium's Real Sponsorship Score is the version built on actual DOL/USCIS filing data — that's the real difference between the two. It's live today, though it's still rolling out across postings as we match more employers to their filing records, so not every Premium job shows it yet."
  },
  {
    q: "Can you tell me if [a specific company] sponsors visas?",
    a: "We can't give a prediction for a specific employer — that would be a guess dressed up as a fact, and we don't do that. The sponsorship badge gives you a general likelihood signal to help you prioritize where to spend your time, not a per-company guarantee."
  },
  {
    q: "I'm on OPT / STEM OPT — does Job-Hopper know my visa situation?",
    a: "We don't collect or use specific visa status in matching today, and we don't give personalized visa timeline advice — that's outside what a job-matching tool should be advising on. What we can do is help you find and prioritize roles more likely to consider sponsorship using the sponsorship-likelihood signal, alongside everything else in your profile."
  },
  {
    q: "Does upgrading to Core or Premium improve my actual chances of getting sponsored?",
    a: "No plan changes an employer's willingness to sponsor — that's outside anyone's control but the employer. What upgrading changes is how much information and filtering you have: Core gives you the full sponsorship badge, and Premium adds real filing-data-backed scoring instead of the heuristic, plus Sponsor Watch alerts. Better information, not better odds."
  },
  {
    q: "Why can't you just guarantee sponsorship-friendly jobs only?",
    a: "Because sponsorship willingness isn't fully knowable in advance — even employers who've sponsored before don't always do so for every role or every year. Instead we extract and score real signal: on Core that's the job posting text, employer size, and industry; on Premium it's actual DOL and USCIS H-1B filing records for that employer (petitions filed, approved, denied). Neither is a promise, but it's real extracted data, not a guess — use it to prioritize where you apply."
  },

  // ---------- PLANS / TRIAL / BILLING ----------
  {
    q: "Is there a free plan?",
    a: "No — there's no Free plan. Job-Hopper has two plans, Core ($29.99/month) and Premium ($49.99/month), and both start with a 14-day free trial. You add a card when you start, you aren't charged until the trial ends, and if you cancel before then you pay nothing. If your university provides Job-Hopper, you don't need to pick a plan at all."
  },
  {
    q: "Is it worth paying if I'm only casually looking?",
    a: "Use the 14-day free trial to decide. It's the full product, so you can see how relevant your matches are before you pay anything, and you can cancel before the trial ends without being charged. Core makes the most sense once you're actively applying and want your search running every day in the background."
  },
  {
    q: "What's the difference between Core and Premium?",
    a: "Core ($29.99/month) runs your job search automatically every day with an email digest, and includes the full sponsorship badge, full Hiring Intel with hiring manager contact, full Resume Advice, the application tracker, and interview practice. Premium ($49.99/month) adds the sponsorship layer: Real Sponsorship Score built on actual DOL/USCIS filing data, Sponsor Watch alerts when an employer's H-1B filing activity changes, and more hiring contacts per job."
  },
  {
    q: "Do you offer discounts, annual plans, or a cheaper tier?",
    a: "Yes — you can pay monthly, quarterly (10% off), or yearly (20% off) on both Core and Premium. There's no cheaper tier below Core, but both plans start with a 14-day free trial. We don't offer coupon codes through the chat."
  },
  {
    q: "If I start a plan and it's not for me, how easy is it to back out?",
    a: "Cancel anytime from your billing settings — a couple of clicks. If you cancel during the 14-day trial you aren't charged. After that, you keep access until the end of the period you've paid for. Your account and data aren't deleted, but you'll need an active plan to use your dashboard again."
  },

  // ---------- RESUME ADVICE / APPLICATION TRACKER ----------
  {
    q: "What exactly does Resume Advice do?",
    a: "It reviews your resume against the roles you're targeting and gives feedback to improve alignment. Full Resume Advice is included in Core and Premium. There are also two one-time extras for a specific job: Per-Job Resume Advice and Per-Job Resume Tailoring, $4.49 each."
  },
  {
    q: "Is the application tracker just a list, or does it do more?",
    a: "It tracks status per job — saved, applied, interviewing, and so on — so your search stays organized in one place instead of scattered across email and spreadsheets. It's included in Core and Premium. If your plan ends, your tracked jobs aren't deleted — they're there again when you restart a plan."
  },
  {
    q: "Why did my resume advice take so long / seem to hang?",
    a: "If Resume Advice seems to be taking an unusually long time or appears stuck, that's worth reporting to support directly rather than waiting indefinitely — reach out at support@job-hopper.io with what you were doing when it happened."
  },

  // ---------- MATCHING / ACCOUNT EDGE CASES (redirect-shaped) ----------
  {
    q: "Why don't I have any matches at all?",
    a: "This is usually about profile scope — very narrow location, salary, or role settings will naturally produce fewer matches. Broadening any of those in your profile settings often helps. If matches are still not appearing after adjusting, that's worth reaching out to support about directly, since it could be an account-specific issue."
  },
  {
    q: "Why was I charged? I thought I was on a free trial.",
    a: "The 14-day free trial turns into a paid plan automatically when it ends unless you cancel before then. Beyond that, this is an account/billing-specific question — I can't look up your account details, but support can check your subscription status directly. Reach out at support@job-hopper.io and they'll sort it out."
  },
  {
    q: "How do I delete my account entirely?",
    a: "You can request full account deletion by contacting support@job-hopper.io. Per our privacy policy, you're entitled to request removal of your data at any time."
  }
];
