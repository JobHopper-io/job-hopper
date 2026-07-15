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
    a: "We actively filter for this — postings get screened for freshness and signs of real hiring activity before they reach your feed, and low-activity or obvious 'ghost' listings get excluded. It's not perfect; some slip through, especially on fast-moving boards. The upcoming Ghost Listing Detector is built specifically to catch reposted, stale listings that current filtering misses."
  },
  {
    q: "Why did I get a match that's clearly wrong for me?",
    a: "Matching looks at role alignment, experience level, location, and salary expectations — occasionally a posting slips through with misleading metadata (a job board mislabels seniority, or a title doesn't reflect the actual role). If a match seems off, that's useful signal — thumbs-down or feedback on the card helps refine future matches for your profile."
  },
  {
    q: "Why do I see the same job posted twice?",
    a: "Employers and job boards sometimes repost the same listing under slightly different titles or dates, which can make it through as a separate posting. This is exactly the pattern the Ghost Listing Detector is built to catch and consolidate."
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
    a: "Today's badge (on Free and Core) is a heuristic — built from employer size, industry, and role signals, not actual visa filing records. It's a useful filter, not a certified fact. The upcoming Real Sponsorship Score (Premium) is the version built on actual DOL/USCIS filing data — that's the real difference between the two."
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
    a: "No plan changes an employer's willingness to sponsor — that's outside anyone's control but the employer. What upgrading changes is how much information and filtering you have: Core gives you the full sponsorship badge instead of a teaser, and Premium (coming soon) adds real filing-data-backed scoring instead of the heuristic. Better information, not better odds."
  },
  {
    q: "Why can't you just guarantee sponsorship-friendly jobs only?",
    a: "Because sponsorship willingness isn't fully knowable in advance from public data — even employers who've sponsored before don't always do so for every role or every year. What we can do honestly is estimate likelihood and let you filter and prioritize accordingly, which is exactly what the sponsorship signal is for."
  },

  // ---------- FREE TO PAID / CONVERSION ----------
  {
    q: "I've been on Free for a while — what am I actually missing?",
    a: "The biggest gap is automation: on Free you're manually re-running a capped number of searches, while Core runs your search automatically every day and emails you a digest. You're also seeing teaser versions of the sponsorship badge, Premium Insights, and Resume Advice on Free — Core unlocks all three fully, plus the application tracker."
  },
  {
    q: "Is it worth upgrading if I'm only casually looking?",
    a: "If you're not actively searching, Free is genuinely fine — no card required, no pressure, and you can see match quality without committing. Core makes the most sense once you're actively applying and want the process running in the background instead of manually checking in."
  },
  {
    q: "What's the single biggest reason to upgrade to Core?",
    a: "Automation. Free requires you to manually trigger a limited number of searches; Core runs unlimited automated daily search and emails you when something good shows up, so you're not the one doing the searching anymore."
  },
  {
    q: "Do you offer discounts, annual plans, or a cheaper tier?",
    a: "Today Core is a flat $29/month, billed monthly, with no long-term commitment — cancel anytime. There's no annual plan currently offered."
  },
  {
    q: "If I upgrade and it's not for me, how easy is it to back out?",
    a: "Cancel anytime from your account settings — a couple of clicks. You keep access through the end of your current billing period, then drop back to Free rather than losing your account or data."
  },

  // ---------- RESUME ADVICE / APPLICATION TRACKER ----------
  {
    q: "What exactly does Resume Advice do?",
    a: "It reviews your resume against the roles you're targeting and gives feedback to improve alignment. Free gives a teaser of this; Core unlocks full Resume Advice. There are also separate one-time paid add-ons — a full resume upgrade and per-job resume tailoring — available on any plan."
  },
  {
    q: "Is the application tracker just a list, or does it do more?",
    a: "It tracks status per job — saved, applied, interviewing, and so on — so your search stays organized in one place instead of scattered across email and spreadsheets. It's included in Core; on Free it's not available, though your data isn't deleted if you're on Free after having Core — it's just not visible until you upgrade again."
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
    q: "Why was I charged and I thought I was on Free?",
    a: "This sounds like an account/billing-specific question — I can't look up your account details, but support can check your subscription status directly. Reach out at support@job-hopper.io and they'll sort it out."
  },
  {
    q: "How do I delete my account entirely?",
    a: "You can request full account deletion by contacting support@job-hopper.io. Per our privacy policy, you're entitled to request removal of your data at any time."
  }
];
