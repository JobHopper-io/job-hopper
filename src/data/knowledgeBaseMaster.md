Job-Hopper Chatbot Knowledge Base — Master v1.2
Consolidated from JHIL v1.0 (KB-0001–KB-0050) + University/Partnership & Internal Ops extension (KB-0051–KB-0055)
Compiled July 16, 2026. Corrected July 16, 2026.

v1.2 CHANGE NOTE
v1.1 was written without direct product/codebase access — confirmed by the source Operating
Manual's own "Product Decisions Required From Nick / Syed / Subaina" section, which listed
pricing, tier features, and sponsorship-signal methodology as open questions. Those facts have
since been verified directly against the live codebase (Pricing.vue, FAQ.vue, and the freemium
settings backend). Five articles were corrected to state verified facts instead of deferring to
"check the live page": KB-0008 (Plans and Pricing Overview), KB-0036 (Free Plan), KB-0037
(Core Plan), KB-0038 (Premium Plan and Waitlist), and KB-0033 (Understanding
Sponsorship-Likelihood Signals — clarified that today's signal is a heuristic, not filing-data-backed,
to avoid conflating it with the future Real Sponsorship Score). All other 50 articles are unchanged
from v1.1. If any corrected fact and the live product ever disagree going forward, the live product
wins — update this file, not the other way around.

WHAT THIS FILE IS
This is the single, complete knowledge base for the Job-Hopper chatbot: 55 articles, one format,
one numbering scheme. It merges:
  - KB-0001 to KB-0050: the already-completed JHIL v1.0 core library (public product, account,
    search, matching, sponsorship, plans/billing, devices, privacy, support, and chatbot policy).
  - KB-0051 to KB-0055: new articles covering university/campus partnerships and an internal
    product-status reference, which existed only in the Operating Manual and had no JHIL-format
    article yet.

HOW TO USE
Load every article below as one retrieval chunk per KB ID. Only articles with AI Approved: Yes
(or Conditional, with its stated conditions honored) may answer public users — see each article's
metadata block. KB-0051 to KB-0055 are AI Approved: No/Conditional and Live State: Planned — the
chatbot should not present their content as available offerings, only as accurate "not yet live"
answers per each article's Canonical Response and Do/Don't rules.

GOVERNANCE (applies to all 55 articles, from JHIL v1.0 Documentation Standard)
Mandatory metadata: Article ID; Title; Category; Department; Audience; Owner; Status; Version;
AI Approved; Last Updated; Review Cycle; Risk Level; Live State; Keywords; Related Articles;
Source of Truth.
Mandatory sections: Purpose; Summary; Detailed Explanation; Key Benefits; Examples; FAQs;
Related Articles; Training AI (Canonical Response; Related Intents; AI Do Rules; AI Don't Rules);
Sales Opportunity; Escalation Rules; Required Ticket Payload; Internal Notes.
Source priority when answers conflict: (1) live authenticated account/checkout state, (2) current
official Job-Hopper policy/pricing/support/product page, (3) approved JHIL article, (4) approved
active campaign record, (5) internal roadmap, clearly labeled future. A lower source never
overrides a higher current source.
Never answer as fact: guaranteed interview/job/salary/sponsorship; immigration eligibility or legal
strategy; employer internal application decisions; unverified price/promotion/limit/release date/
feature; refund approval or support action that hasn't actually occurred.

================================================================================

KB-0001 - What Is Job-Hopper?
Purpose
Create one authoritative definition of Job-Hopper for product, support, sales, marketing, and the chatbot.

Summary
Job-Hopper is an AI job-search tool for U.S. professionals that finds, vets, and matches relevant roles
based on the user’s profile and preferences.

Detailed Explanation
Job-Hopper reduces the time, noise, and uncertainty involved in searching for work. Users create a
profile, upload a resume, and define preferences such as target role, compensation, and location. Job-
Hopper then monitors job sources, filters obvious low-quality or stale opportunities, and presents
curated matches with available context.
Job-Hopper is not an employer, recruiting agency, immigration sponsor, law firm, or guarantee of
employment. Employers make all interview, hiring, compensation, and sponsorship decisions.

Key Benefits
Less time spent searching
More relevant opportunities
Better visibility into role quality
A structured job-search workflow

Examples
A software engineer sets a target role, pay range, and location, then reviews curated matches.
An international professional uses sponsorship-likelihood context to prioritize research.

FAQs
Does Job-Hopper apply for me?
Job-Hopper finds and organizes relevant roles. Do not describe automated application submission unless
a separately approved live-feature article confirms it.

Is Job-Hopper a recruiter?
No. It is a job-search intelligence platform.

Does Job-Hopper guarantee a job?
No. It cannot guarantee interviews, offers, sponsorship, or hiring.

Related Articles
KB-0005; KB-0007; KB-0017; KB-0025

Training AI
Canonical Response
Job-Hopper is an AI job-search platform for U.S. professionals. It helps you find and review curated roles
based on your background, pay expectations, and location, so you spend less time filtering irrelevant
listings.

Related Intents
what is job hopper
job hopper definition
is job hopper a recruiter
how job hopper helps

AI Do Rules
Lead with the plain-language definition.
State that matches are curated.
Clarify that employers control hiring outcomes when relevant.

AI Don’t Rules
Do not call Job-Hopper an employer or recruiter.
Do not guarantee interviews, offers, or sponsorship.
Do not claim a feature is live unless its article says Live.

Sales Opportunity
Answer first. Recommend Free for a first look, Core for automated matching and full insights, or
Premium only when sponsorship intelligence is relevant and currently available.

Escalation Rules
Escalate account-specific problems, billing, privacy, suspected fraud, or a material conflict between the
live product and approved documentation.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Use this definition everywhere. The current site identifies Job-Hopper as a product of Schepmont Group.

KB-0002 - Job-Hopper Mission
Purpose
Define the organization’s present-day purpose.

Summary
Job-Hopper’s mission is to make job searching more focused, transparent, and efficient by helping
people discover fewer, better opportunities.

Detailed Explanation
Traditional job search forces candidates to scan repetitive listings, guess which roles are active, and
apply without useful context. Job-Hopper exists to replace that process with structured intelligence.
The mission is not to maximize application volume. It is to improve the quality of decisions: which roles
deserve attention, which employers appear relevant, and where a candidate’s time is best spent.

Key Benefits
A clearer job-search process
Reduced wasted effort
More informed application decisions
A consistent experience across career levels

Examples
About-page line: We help people spend less time searching and more time pursuing opportunities that
fit.

FAQs
Is the mission only about AI?
No. AI is an enabling technology; the mission is a better job-search experience.

Is the mission only for visa seekers?
No. Sponsorship intelligence is a specialized layer for users who need it.

Related Articles
KB-0003; KB-0004; KB-0006

Training AI
Canonical Response
Our mission is to make job searching more focused and less wasteful by helping people discover fewer,
better opportunities and make more informed decisions.

Related Intents
job hopper mission

company purpose
why job hopper exists

AI Do Rules
Use plain, human language.
Connect the mission to wasted time and noisy listings.

AI Don’t Rules
Do not frame the mission as replacing employers or recruiters.
Do not promise a job outcome.

Sales Opportunity
A mission question is not a forced sales moment. Link to getting started only when the user is actively
searching.

Escalation Rules
Escalation is only required if leadership requests a change to the official mission.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Strategic canonical language for v1.0.

KB-0003 - Job-Hopper Vision
Purpose
Describe the future state Job-Hopper is building toward.

Summary
Job-Hopper’s vision is to become the trusted intelligence layer between job seekers and the U.S.
employment market.

Detailed Explanation
The long-term vision is a job-search operating system that understands the user’s goals, interprets
changing job-market data, and supports decisions from discovery through application and career
growth.
The vision includes richer match intelligence, sponsorship context, application organization, career
guidance, and connected experiences for universities and employers. Future-state language must always
be separated from live-product claims.

Key Benefits
A unified job-search experience
Scalable institutional knowledge
More transparent market signals
Consistent support and guidance

Examples
Future-state statement: One trusted place to understand what to pursue, why it fits, and what to do next.

FAQs
Is every part of the vision live today?
No. The vision includes roadmap capabilities.

Will AI replace human career advisors?
No. AI can support repeatable guidance and hand off nuanced questions.

Related Articles
KB-0002; KB-0030; KB-0050

Training AI
Canonical Response
Our vision is to become the trusted intelligence layer for job seekers - helping people understand which
opportunities fit, why they fit, and what action to take next.

Related Intents
job hopper vision
future of job hopper
job search operating system

AI Do Rules
Use future tense for roadmap concepts.
Separate vision from current availability.

AI Don’t Rules
Do not market roadmap items as live.
Do not imply autonomous hiring or immigration decisions.

Sales Opportunity
Vision questions are not direct sales moments. Describe current plans only after separating live and
future capabilities.

Escalation Rules
Escalate requests for public roadmap commitments, release dates, partnerships, or unannounced
features.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
This article governs future-facing language; roadmap records govern availability.

KB-0004 - Why Job-Hopper Exists
Purpose
Explain the market problem that led to Job-Hopper.

Summary
Job-Hopper exists because modern job search is crowded with stale postings, weak filters, repetitive
work, and too little context.

Detailed Explanation
Job boards make it easy to see many listings but difficult to know which ones are current, relevant, or
worth the effort. Candidates repeat searches across multiple sites and often lack context about fit or
sponsorship.
Job-Hopper shifts the experience from volume to curation. The current site says the platform monitors
job boards and company career pages, filters stale, low-quality, and obviously resume-collecting roles,
and matches opportunities based on experience and preferences.

Key Benefits
Less search fatigue
Lower exposure to stale listings
More deliberate applications
A clearer weekly search routine

Examples
The problem is not a lack of listings; it is finding active, relevant opportunities without losing hours to
noise.

FAQs
Why not use a normal job board?
Job boards remain useful sources. Job-Hopper adds curation, filtering, matching, and organization.

Does Job-Hopper replace company career pages?
No. The original employer page remains important for final details and application.

Related Articles
KB-0001; KB-0006; KB-0018

Training AI
Canonical Response
Job-Hopper exists because job seekers should not have to spend hours separating useful opportunities
from noise. It adds curation, matching, and structure to the search.

Related Intents
why job hopper was built
stale jobs
job search noise
resume collecting jobs

AI Do Rules
Acknowledge the frustration before explaining the solution.
Emphasize quality over volume.

AI Don’t Rules
Do not attack named job boards.
Do not claim every filtered listing is fraudulent.

Sales Opportunity
Recommend Free for users testing curation and Core for users seeking ongoing automated matching and
full insights.

Escalation Rules
Escalate reports of fraudulent listings, systematic source problems, or harmful content.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Differentiate through workflow and curation, not unsupported superiority claims.

KB-0005 - Who Job-Hopper Helps
Purpose
Define the core audiences without narrowing the product to one industry or immigration status.

Summary
Job-Hopper helps U.S.-focused job seekers from entry level through executive leadership across role
families represented by current job sources.

Detailed Explanation
The platform is designed for people actively exploring employment in the United States who want a
more structured search. It can support early-career candidates, experienced professionals, managers,
directors, vice presidents, and executives.
Users who require visa sponsorship are an important audience, but not the only audience. Sponsorship
intelligence is a specialized layer, not the entire identity of Job-Hopper.

Key Benefits
Broad career-stage coverage
Cross-industry relevance
Support for domestic and international candidates
Specialized sponsorship context

Examples
A recent graduate searching for entry-level operations roles.
A director comparing leadership opportunities.
An international professional prioritizing employers with positive sponsorship signals.

FAQs
Is Job-Hopper only for students?
No.

Is it only for technology jobs?
No.

Can senior leaders use it?
Yes; the current positioning covers professionals across career levels.

Related Articles
KB-0001; KB-0009; KB-0013

Training AI
Canonical Response
Job-Hopper is for serious U.S.-focused job seekers across career stages and industries, including users
who need sponsorship context.

Related Intents
who is job hopper for
students
executives
international professionals
industries

AI Do Rules
Answer inclusively.
Mention sponsorship only when relevant.

AI Don’t Rules
Do not assume immigration status.
Do not imply complete coverage of every occupation or location.

Sales Opportunity
Recommend plans by needed depth, not title or seniority.

Escalation Rules
Escalate university, employer, enterprise, accessibility, or bulk-user inquiries to the relevant team.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Audience coverage should be updated as product data supports new vertical claims.

KB-0006 - Why Choose Job-Hopper
Purpose
Provide a defensible differentiation statement.

Summary
Job-Hopper combines curated matching, active-posting filtering, match context, dashboard delivery, and
job-search organization in one experience.

Detailed Explanation
The strongest reason to choose Job-Hopper is not a claim that it has the largest number of listings. The
differentiation is focus. Job-Hopper uses profile information and preferences to curate opportunities,
filters obvious low-quality or stale roles, and gives users a more usable review workflow.
For users who need immigration sponsorship, deeper sponsorship-likelihood context can help prioritize
research. This capability must be described according to current plan availability.

Key Benefits
Quality over volume
Personalized preferences
Reduced manual filtering
Organized review
Sponsorship context when relevant

Examples
A job board gives search results; Job-Hopper gives a curated workflow.

FAQs
Is Job-Hopper better than every job board?
The approved claim is a different, more curated workflow - not universal superiority.

Can I still use other platforms?
Yes. Job-Hopper can be part of a broader strategy.

Related Articles
KB-0004; KB-0007; KB-0023

Training AI
Canonical Response
Choose Job-Hopper when you want a more curated, organized search instead of manually filtering large
volumes of listings.

Related Intents
why choose job hopper
job hopper benefits
job hopper vs job boards

AI Do Rules
Use defensible differences.
Focus on relevance and time saved.

AI Don’t Rules
Do not claim exclusive access to jobs.
Do not disparage competitors.
Do not publish unsupported rankings.

Sales Opportunity
Recommend Free for evaluation, Core for automated daily matching and full insights, and Premium only
for relevant sponsorship needs when available.

Escalation Rules
Escalate requests for formal competitor claims, performance statistics, or press comparisons.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Any quantified claim requires approved analytics.

KB-0007 - How Job-Hopper Works
Purpose
Explain the end-to-end current product flow.

Summary
Users create a profile, upload a resume, set preferences, receive curated matches, review available
insights, and decide which jobs to pursue.

Detailed Explanation
The standard flow is: create an account; upload a current resume; define role, pay, and location
preferences; allow Job-Hopper to collect and filter postings from approved sources; review matches in
the dashboard or email; verify the original employer posting; decide whether to apply; and organize
progress with available tracking tools.
The user remains responsible for reviewing requirements and submitting accurate information.

Key Benefits
Fast setup
Continuous discovery
Better filtering
Organized review
User control

Examples
A user uploads a resume, selects product-management roles in Chicago, and receives curated
opportunities with fit context.

FAQs
How long does setup take?
The public site positions setup as quick; completion time depends on profile detail.

Does Job-Hopper search continuously?
The current site says the Hopper continuously pulls new postings.

Where do matches appear?
The dashboard and available email notifications.

Related Articles
KB-0010; KB-0013; KB-0017; KB-0025

Training AI
Canonical Response
Create your profile, upload your resume, set the role, pay, and location you want, and Job-Hopper will
curate relevant opportunities for review.

Related Intents
how it works
getting started
job matching flow
setup steps

AI Do Rules
Give steps in order.
Keep the explanation actionable.
End with user control.

AI Don’t Rules
Do not add auto-apply claims unless confirmed live.
Do not promise a fixed number of matches.

Sales Opportunity
After explaining the flow, suggest Free to try the experience or Core for automated daily matching and
full insights.

Escalation Rules
Escalate errors, missing steps, or material differences between the live interface and this flow.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Product screenshots should be maintained separately because UI labels change faster than concepts.

KB-0008 - Plans and Pricing Overview
Purpose
Provide one controlled explanation of current plans and pricing.

Summary
Job-Hopper currently presents Free, Core, and Premium plan concepts. Pricing and availability must be
verified on the official pricing page or live checkout before quoting.

Detailed Explanation
Free is $0/month with no card required: 3 manual job searches, a teaser view of the sponsorship badge, a few visible Premium Insights fields with the rest blurred, and a teaser of Resume Advice. Core is $29/month and unlocks unlimited automated daily job search with an email digest, the full sponsorship badge, full Premium Insights, full Resume Advice, and the Job Tracker. Premium is $49/month at launch, not yet purchasable - join the waitlist for early access - and adds Real Sponsorship Score, Sponsor Watch, Apply Intelligence, Hiring Manager Contact, and the Ghost Listing Detector on top of everything in Core. Plans differ by depth of automation, not by seniority or job type.
Exact prices, the search cap, and feature availability can still change - the pricing page and live checkout remain the operational source of truth if this article and the live product ever disagree.

Key Benefits
No-cost starting point
Clear paid path for deeper use
Plan choice based on depth rather than seniority

Examples
User wants to test: recommend Free.
User wants daily automated matching and full insights: explain Core.
User needs deeper sponsorship intelligence: explain Premium and verify availability.

FAQs
Which plan should I choose?
Choose by search depth and sponsorship needs, not seniority.

Is Premium live?
Verify the current pricing page or checkout.

Can prices change?
Yes; always use the current official page.

Related Articles
KB-0036; KB-0037; KB-0038; KB-0039

Training AI
Canonical Response
Free ($0, no card) gives you 3 manual searches and teaser insights. Core ($29/month) unlocks unlimited automated daily matching, the full sponsorship badge, full insights, full Resume Advice, and the Job Tracker. Premium ($49/month at launch, waitlist only) adds Real Sponsorship Score, Sponsor Watch, Apply Intelligence, Hiring Manager Contact, and the Ghost Listing Detector on top of Core.

Related Intents
pricing
plans
free vs core
premium price
which plan

AI Do Rules
State when the price was verified.
Link to the pricing page.
Explain availability honestly.

AI Don’t Rules
Do not invent discounts.
Do not promise Premium availability without verification.
Do not sell by seniority.

Sales Opportunity
Core is appropriate for ongoing automated matching and full insights. Premium is relevant only when
sponsorship depth is important and availability is confirmed.

Escalation Rules
Escalate billing discrepancies, checkout errors, legacy-plan questions, coupon requests, or conflicts
between public pages and checkout.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Review monthly and after every checkout or pricing change.

KB-0009 - H-1B Jobs and Sponsorship Intelligence
Purpose
Explain sponsorship-aware search without legal advice or guarantees.

Summary
Job-Hopper can add sponsorship-likelihood context to relevant job opportunities so users can prioritize
research and applications more intelligently.

Detailed Explanation
A sponsorship signal is contextual information suggesting whether an employer or role may be more or
less relevant to someone who needs work-authorization support. The current site says posting metadata
can be analyzed so users can filter or sort by sponsorship likelihood when H-1B or other employer
sponsorship is relevant.
A signal is not a promise. Employer policy, role needs, candidate qualifications, and immigration rules
can change. Job-Hopper is not a law firm and does not provide immigration legal advice.

Key Benefits
Avoid obviously irrelevant applications
Prioritize employer research
Add context beyond keyword search
Support international professionals

Examples
Approved: This role shows a positive sponsorship-likelihood signal.
Not approved: This company will sponsor your H-1B.

FAQs
Does a positive signal guarantee sponsorship?
No.

Can Job-Hopper decide whether I qualify for H-1B?
No; that is a legal and fact-specific question.

Can employers change sponsorship policy?
Yes.

Related Articles
KB-0033; KB-0034; KB-0035; KB-0050

Training AI
Canonical Response
Job-Hopper can show sponsorship-likelihood signals that help you prioritize roles, but a signal is not a
guarantee that an employer will sponsor you. Confirm the role with the employer and use qualified legal
counsel for immigration advice.

Related Intents
H1B jobs
visa sponsorship jobs
will this company sponsor
international student jobs

AI Do Rules
Use the phrase sponsorship-likelihood signal.
State the no-guarantee rule.
Refer legal eligibility questions to qualified counsel.

AI Don’t Rules
Do not say an employer will sponsor.
Do not interpret immigration law.
Do not promise visa approval or timing.

Sales Opportunity
Premium may be relevant when the user wants deeper sponsorship intelligence. Explain availability
without fear-based selling.

Escalation Rules
Escalate incorrect sponsorship data, employer disputes, legal questions, or high-stakes reliance on a
signal.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Visa-related content requires product and legal review.

KB-0010 - Resume Upload
Purpose
Explain why the resume is requested and how it supports matching.

Summary
Users upload a current resume so Job-Hopper can understand their background and improve match
relevance.

Detailed Explanation
The resume provides evidence of experience, skills, education, seniority, industries, and career history.
Job-Hopper uses that information with stated preferences to evaluate potential fit.
Users should upload an accurate, readable, current resume. Job-Hopper does not verify every claim, and
the user remains responsible for the truthfulness of application materials. File types, size limits, and
parsing behavior must follow the live interface.

Key Benefits
More informed matching
Less repetitive entry
Better understanding of skills and seniority

Examples
A user changes career direction and uploads an updated resume so future matches reflect the transition.

FAQs
Is a resume required?
The current product flow asks users to upload one for better matching; follow the live interface.

Will Job-Hopper rewrite it automatically?
Only describe resume-rewriting if a separate approved live-feature article confirms it.

Can I update my resume?
Users should keep it current; exact steps depend on the live interface.

Related Articles
KB-0031; KB-0032; KB-0012

Training AI
Canonical Response
Upload your current resume so Job-Hopper can understand your background and improve the relevance
of your matches.

Related Intents
upload resume
resume required
resume file
resume matching

AI Do Rules
Explain the matching purpose.
Remind users to use an accurate current file.

AI Don’t Rules
Do not claim employer verification.
Do not claim unsupported rewriting features.

Sales Opportunity
A resume-upload question is normally not a sales moment. Core can be mentioned later if the user wants
ongoing matching.

Escalation Rules
Escalate upload failures, parsing problems, missing data, or privacy concerns.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Add supported formats and size limits after formal product validation.

KB-0011 - Creating a Job-Hopper Account
Purpose
Explain account registration and basic security expectations.

Summary
Users can create a Job-Hopper account through the registration page and then continue to profile setup.

Detailed Explanation
Registration requires the account information and credentials shown in the live interface. Users should
register with an email they can access, use a strong unique password, and complete any verification
step.
If registration fails, check the email spelling, determine whether an account already exists, retry in a
supported browser, and contact support if the issue continues. Job-Hopper staff and the chatbot must
never ask for a password or one-time code.

Key Benefits
Fast onboarding
Secure account access
A saved profile and dashboard

Examples
A user registers with an accessible email, verifies it if required, and continues to profile setup.

FAQs
Do I need a card for Free?
The current pricing page states no card is required for Free.

Can I create multiple accounts?
Users should normally maintain one accurate personal account unless support approves otherwise.

Related Articles
KB-0012; KB-0044

Training AI
Canonical Response
Create your account with an email you can access, use a secure password, and complete any verification
step shown on screen.

Related Intents
sign up
create account

registration
verification email

AI Do Rules
Give direct registration steps.
Suggest checking spam for verification messages.

AI Don’t Rules
Never request a password or one-time code.
Do not create accounts on behalf of users.

Sales Opportunity
Free is the natural recommendation for someone who wants to test the product.

Escalation Rules
Escalate duplicate-account, verification, blocked-registration, or suspicious-access issues.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Never collect authentication secrets in support channels.

KB-0012 - Completing Your Profile
Purpose
Define the profile quality needed for useful matching.

Summary
A complete profile combines the resume with current role information and clear preferences.

Detailed Explanation
Profile quality directly affects match quality. Users should review imported resume information, correct
outdated details, and provide realistic preferences. They should update the profile after a promotion,
career change, relocation, major resume revision, or material change in job-search goals.
A profile is an input to matching, not a promise of eligibility. Missing or inaccurate information can
produce broad or weak matches.

Key Benefits
Better relevance
Fewer unsuitable roles
More useful explanations

Examples
A project manager changes the desired location from New York to U.S. remote roles.

FAQs
Why are my matches broad?
The profile or preferences may need more detail.

Should I include my current title?
Yes, when the field is available and accurate.

Related Articles
KB-0010; KB-0013; KB-0020

Training AI
Canonical Response
Complete your profile with accurate background information and clear job preferences. Current
information produces more useful matching than outdated or overly broad inputs.

Related Intents
complete profile
profile settings
edit profile

match quality

AI Do Rules
Encourage accuracy and updates.
Explain the relationship between inputs and outputs.

AI Don’t Rules
Do not advise users to misstate experience.
Do not guarantee a score.

Sales Opportunity
Core may be relevant after setup if the user wants automated daily matching.

Escalation Rules
Escalate fields that cannot be edited, corrupted profile data, or account-ownership concerns.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Maintain a UI field guide separately.

KB-0013 - Setting Job Preferences
Purpose
Standardize how users define the jobs they want.

Summary
Preferences tell Job-Hopper which roles, compensation levels, and locations to prioritize.

Detailed Explanation
The preference set should reflect jobs the user would seriously consider. Overly broad preferences
create noise, while extremely narrow preferences can reduce opportunities. Begin with one primary
role family and realistic compensation and location criteria, then refine based on match quality.
Preferences are signals, not employer commitments. Source postings may contain incomplete or
changing data.

Key Benefits
Focused matches
More user control
Faster comparison

Examples
Target: Customer Success Manager; preferred minimum pay: $90,000; location: Boston or U.S. remote.

FAQs
Can I target more than one role?
Follow the live controls; keep related roles together.

Why did I receive a nearby title?
Matching may identify related roles, not only exact keywords.

Related Articles
KB-0014; KB-0015; KB-0016

Training AI
Canonical Response
Set preferences around the roles, compensation, and locations you would genuinely consider, then
refine them based on the relevance of your matches.

Related Intents
job preferences
search settings
target job

desired role

AI Do Rules
Explain the precision-versus-volume tradeoff.
Suggest one primary target.

AI Don’t Rules
Do not promise exact compliance when source data is missing.
Do not encourage unrealistic claims.

Sales Opportunity
Core can be recommended for continuous matching after preferences are configured.

Escalation Rules
Escalate missing controls, settings that do not save, or repeated clearly unrelated matches.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Preference analytics must be anonymized and approved.

KB-0014 - Role and Title Preferences
Purpose
Help users choose job titles that improve matching.

Summary
Users should choose a primary target role and a small set of closely related titles that reflect experience
and the intended next step.

Detailed Explanation
Titles vary by employer. Customer Success Manager may overlap with Account Manager or Client
Success Lead. Job-Hopper can evaluate semantic relevance, but users should still define a clear role
family.
Career changers should use titles supported by transferable skills and should not assume that adding a
title establishes qualification.

Key Benefits
Broader semantic coverage
Fewer missed adjacent roles
Clearer direction

Examples
Primary: Data Analyst. Related: Business Intelligence Analyst, Reporting Analyst.

FAQs
Should I add every possible title?
No. Use a focused role family.

Can I target a promotion?
Yes, while keeping expectations aligned with experience and scope.

Related Articles
KB-0013; KB-0020

Training AI
Canonical Response
Choose one primary target and a small set of closely related titles. Focused role families usually produce
better results than a long list of unrelated jobs.

Related Intents
job title
target role

related titles
career change

AI Do Rules
Give examples of related titles.
Keep advice realistic.

AI Don’t Rules
Do not declare qualification based only on title.
Do not encourage keyword stuffing.

Sales Opportunity
Mention Core only if the user wants ongoing monitoring of related roles.

Escalation Rules
Escalate repeated title-matching errors or missing role categories.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Future product taxonomy should normalize title families.

KB-0015 - Pay Range Preferences
Purpose
Explain compensation preferences and source-data limitations.

Summary
A pay preference helps prioritize roles aligned with the user’s expectations when reliable compensation
data is available.

Detailed Explanation
Users should set realistic expectations based on experience, location, industry, and role level. Employers
may publish base salary, total compensation, hourly pay, a broad range, or no amount.
Job-Hopper must distinguish employer-published figures from estimates and unknown data. A role
without published pay should not be presented as confirmed below or above the user’s preference.

Key Benefits
Avoid under-target roles
Support faster comparison
Clarify expectations

Examples
A user prefers at least $110,000 base. A job with no salary should be labeled unknown rather than
automatically rejected.

FAQs
Why did I receive a role without salary?
The employer may not have published compensation.

Does the range include bonus or equity?
Only when the source explicitly says so.

Related Articles
KB-0013; KB-0020

Training AI
Canonical Response
Set a realistic pay preference, but remember that employers do not always publish complete
compensation details. Confirm unknown or ambiguous pay directly with the employer.

Related Intents
salary filter
pay range

compensation
hourly rate

AI Do Rules
Separate published facts from estimates.
Use base and total compensation carefully.

AI Don’t Rules
Do not invent salary.
Do not treat an estimate as an employer promise.

Sales Opportunity
Core’s full insights may be relevant when users want deeper role comparison.

Escalation Rules
Escalate clearly incorrect compensation data or systematic parsing issues.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Every compensation value should retain source context.

KB-0016 - Location and Remote-Work Preferences
Purpose
Explain location matching and the limits of remote labels.

Summary
Users can set location and remote-work preferences, but must review each employer’s geographic and
work-authorization restrictions.

Detailed Explanation
Remote does not always mean work from anywhere. A role may be remote only in certain states, time
zones, tax jurisdictions, or commuting areas. Hybrid roles may require regular office attendance.
Job-Hopper should preserve source language and avoid converting remote eligible into fully remote
without evidence.

Key Benefits
Better geographic fit
Fewer avoidable applications
Clearer remote expectations

Examples
A role is remote within California only; the chatbot must not describe it as nationwide remote.

FAQs
Can I work remotely from outside the U.S.?
The employer’s posting and policy determine that. Remote does not automatically mean international.

What does hybrid mean?
It combines remote and on-site work; exact attendance varies.

Related Articles
KB-0013; KB-0019

Training AI
Canonical Response
Set your preferred location, then review every posting for state, time-zone, hybrid, and work-
authorization restrictions.

Related Intents
remote jobs
location filter
hybrid

work from anywhere

AI Do Rules
Preserve geographic restrictions.
Explain ambiguity.

AI Don’t Rules
Do not say remote means worldwide.
Do not override posted location requirements.

Sales Opportunity
Core may help monitor multiple selected locations.

Escalation Rules
Escalate systematic location-label errors or disputes about a listing.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Location data can change after publication.

KB-0017 - How Jobs Are Collected
Purpose
Explain the collection layer without exposing sensitive implementation details.

Summary
Job-Hopper monitors new postings across job boards and direct company career pages.

Detailed Explanation
The collection system continuously brings in postings from approved public sources. The platform
normalizes and evaluates data before presenting matches. The current site specifically references
sources such as LinkedIn, Indeed, and direct employer career pages.
The chatbot must not disclose private collection methods, credentials, anti-bot techniques, vendor
contracts, security architecture, or source-specific operational controls.

Key Benefits
Broader discovery
Continuous refresh
Less repetitive searching

Examples
A newly published role on a company career page is collected and evaluated for relevant users.

FAQs
Where do jobs come from?
Approved job boards and company career pages.

Does Job-Hopper own the listings?
No. The listing originates from the employer or source.

Related Articles
KB-0018; KB-0019; KB-0029

Training AI
Canonical Response
Job-Hopper monitors postings from job boards and company career pages, then filters and matches
them before showing them to users.

Related Intents
job sources
where jobs come from
collect jobs

career pages

AI Do Rules
Keep the explanation high level.
Credit the original employer or source.

AI Don’t Rules
Do not disclose sensitive collection methods.
Do not imply ownership of listings.

Sales Opportunity
No direct sales pitch is necessary.

Escalation Rules
Escalate takedown requests, copyright complaints, employer disputes, or suspected unauthorized access.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Engineering details are restricted internal information.

KB-0018 - Job Vetting and Quality Filtering
Purpose
Define what vetted means and does not mean.

Summary
Job-Hopper filters obvious stale, low-quality, duplicate, and resume-collecting roles using approved
automated and human-informed checks.

Detailed Explanation
Vetting is quality control, not a legal certification. It can reduce obvious noise but cannot guarantee that
every employer or role remains legitimate and unchanged after publication.
Users should still review the employer domain, original posting, role details, and application destination
before sharing sensitive information.

Key Benefits
Less noise
Reduced duplicate exposure
More useful matches
Additional trust checks

Examples
A repeatedly reposted role with weak details may be deprioritized or filtered.

FAQs
Does vetted mean guaranteed legitimate?
No. It means the listing passed approved checks at the time of review.

What if a listing looks suspicious?
Do not apply or share information; report it to support.

Related Articles
KB-0019; KB-0045; KB-0046

Training AI
Canonical Response
Job-Hopper filters obvious low-quality and stale roles, but you should still verify the original employer
posting and report anything suspicious.

Related Intents
vetted jobs
job quality

scam listing
stale job

AI Do Rules
Define vetting carefully.
Encourage source verification.

AI Don’t Rules
Do not guarantee scam-free listings.
Do not dismiss warning signs.

Sales Opportunity
Quality filtering is a core value; avoid aggressive upselling.

Escalation Rules
Escalate suspected fraud, malicious links, impersonation, or repeated low-quality sources immediately.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Safety reports should record the source URL and screenshot.

KB-0019 - Active Posting Standard
Purpose
Define how the product speaks about active jobs.

Summary
Job-Hopper prioritizes active postings, but job availability can change between collection, review, and
application.

Detailed Explanation
An active signal means the role appeared open at the latest approved check. Employers can pause, close,
edit, or remove roles at any time. Third-party pages can update later than the employer’s career site.
The original employer application page should be treated as the final operational source when the user
applies.

Key Benefits
Fewer closed-role clicks
More current discovery
Clearer expectations

Examples
A role is active when matched but closes before the user applies. The answer should explain timing, not
promise real-time synchronization.

FAQs
Why is my matched job closed?
The employer may have changed it after the last check.

Which page should I trust?
The employer’s current career page.

Related Articles
KB-0017; KB-0018; KB-0045

Training AI
Canonical Response
Job-Hopper prioritizes active roles, but employers can close or change a posting at any time. Confirm
availability on the employer’s current application page.

Related Intents
active job
closed listing

stale posting
job unavailable

AI Do Rules
Acknowledge timing limitations.
Direct the user to the employer source.

AI Don’t Rules
Do not guarantee real-time synchronization.
Do not blame the user.

Sales Opportunity
Do not sell during a closed-listing complaint.

Escalation Rules
Escalate repeated stale listings from the same source or a posting that remains active long after closure.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Track source freshness metrics internally.

KB-0020 - Match Score
Purpose
Explain match scoring and its limitations.

Summary
A match score is a decision-support signal showing how closely a role appears to align with the user’s
profile and preferences.

Detailed Explanation
The score may consider resume experience, skills, title relevance, seniority, location, compensation, and
other available job data. Missing or ambiguous source information can affect the result.
A high score does not prove eligibility or predict an interview. A lower score does not mean the user
must avoid a role. Users should read the reasons and apply judgment.

Key Benefits
Faster prioritization
Transparent comparison
A consistent review framework

Examples
A role aligns on skills and location but has unknown compensation; the explanation should show the
unknown factor.

FAQs
Does 90% mean a 90% hiring chance?
No.

Can I apply to a lower-score role?
Yes. The score is guidance, not a rule.

Related Articles
KB-0012; KB-0028; KB-0030

Training AI
Canonical Response
The match score helps you prioritize roles based on available profile and job data. It is not a prediction
of interview or hiring success.

Related Intents
match score
fit score

why this job
match percentage

AI Do Rules
Explain factors and uncertainty.
Encourage reading detailed reasons.

AI Don’t Rules
Do not translate score into hiring probability.
Do not call it an eligibility decision.

Sales Opportunity
Core’s full insights may be relevant when a Free user wants deeper explanations.

Escalation Rules
Escalate clearly inconsistent scores, discriminatory-impact concerns, or reproducible calculation bugs.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Product must maintain an internal score-factor specification.

KB-0021 - Job-Hopper Dashboard
Purpose
Describe the dashboard as the central workspace.

Summary
The dashboard is where users review curated matches, insights, and available tracking information.

Detailed Explanation
The dashboard helps users identify new matches, review key role details, and decide what to do next.
Exact modules can vary by plan and rollout.
The chatbot must avoid inventing buttons or tabs. Navigation instructions should use current approved
UI labels or labels the user reports seeing.

Key Benefits
One place for matches
Simpler daily review
Access to insights and tracking

Examples
A user opens the dashboard, reviews new matches, opens a role, and records the next action.

FAQs
Why do I see fewer features?
Features can vary by plan or rollout; support can verify the account.

Can I use it on mobile?
Job-Hopper is a progressive web app; responsive behavior depends on device and browser.

Related Articles
KB-0022; KB-0023; KB-0044

Training AI
Canonical Response
Your dashboard is the main place to review curated matches and available insights. Features may vary
by plan and rollout.

Related Intents
dashboard
where are my matches
job hopper app

features missing

AI Do Rules
Use current UI labels.
Mention plan differences carefully.

AI Don’t Rules
Do not invent navigation.
Do not request account credentials.

Sales Opportunity
Explain plan-gated features only when relevant.

Escalation Rules
Escalate blank dashboards, missing data, access errors, or account-specific feature mismatches.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Maintain a screenshot-based UI guide separately.

KB-0022 - Email Delivery of Job Matches
Purpose
Explain inbox delivery and basic troubleshooting.

Summary
Curated job matches may be delivered to the user’s email inbox as well as the dashboard.

Detailed Explanation
Users should register with an email they monitor and add Job-Hopper to safe senders if messages are
filtered. Delivery frequency and controls must be described only according to live settings.
Email is a notification channel. The dashboard and original employer page should be used for the latest
information.

Key Benefits
Convenient alerts
Less repeated login
Faster review

Examples
A user receives a match email, opens the dashboard, and confirms the role remains active.

FAQs
I am not receiving emails. What should I do?
Check spam, promotions, email spelling, notification settings, and safe-sender controls.

Can I change frequency?
Use available settings; contact support if the control is missing.

Related Articles
KB-0021; KB-0043; KB-0044

Training AI
Canonical Response
Job-Hopper can send curated matches to your inbox. Check spam and notification settings if messages
are missing, and use the dashboard for the latest match information.

Related Intents
email matches
not receiving emails
job alerts

inbox

AI Do Rules
Give basic troubleshooting.
Direct users to the dashboard.

AI Don’t Rules
Do not claim an unsupported frequency.
Do not request email passwords.

Sales Opportunity
No upsell during a deliverability issue.

Escalation Rules
Escalate persistent delivery failures, bounces, or account-email changes.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Support should record the email provider and last known successful delivery.

KB-0023 - Job Tracker
Purpose
Define the tracker as an organization tool, not an employer-status feed.

Summary
The Job Tracker helps users organize opportunities and record application progress.

Detailed Explanation
The tracker may include stages such as saved, preparing, applied, interviewing, offer, or closed,
depending on the live product. Status generally reflects user-entered information unless an approved
integration says otherwise.
Job-Hopper does not automatically know an employer’s internal decision merely because a role is in the
tracker.

Key Benefits
One application pipeline
Follow-up visibility
Less spreadsheet work
Clear next actions

Examples
A user moves a role from saved to applied after submitting on the employer’s site.

FAQs
Does Job-Hopper know whether the employer viewed my application?
Not unless a separately approved integration provides that data.

Are reminders automatic?
Only describe reminder behavior confirmed in the live product.

Related Articles
KB-0024; KB-0026; KB-0037

Training AI
Canonical Response
Use the Job Tracker to organize the roles you are considering and record your progress. It is not an
employer’s internal status system.

Related Intents
job tracker
application tracker

application status
saved jobs

AI Do Rules
Clarify user-entered versus employer-provided data.
Encourage regular updates.

AI Don’t Rules
Do not imply access to employer ATS data.
Do not invent tracker stages.

Sales Opportunity
Tracker access is a Core selling point when the pricing page confirms it.

Escalation Rules
Escalate missing tracker entries, data-loss reports, or status changes the user did not make.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Product should document exact stages and retention behavior.

KB-0024 - Saving and Organizing Jobs
Purpose
Explain how users can organize opportunities before applying.

Summary
Saving a role allows the user to return to it, compare it with other opportunities, and decide on the next
action.

Detailed Explanation
Users should save roles they genuinely intend to review rather than using the saved list as an unlimited
archive. They should re-check the employer posting before applying because details and availability can
change.
If folders, notes, labels, or prioritization controls exist, the chatbot should describe only the live controls.
The underlying principle is to maintain a manageable shortlist.

Key Benefits
A focused shortlist
Easier comparison
Better follow-through

Examples
A user saves three similar roles and later compares location, compensation, and sponsorship signals.

FAQs
Does saving reserve the job?
No.

Will a saved job remain open?
Not necessarily; employers control availability.

Related Articles
KB-0019; KB-0023; KB-0025

Training AI
Canonical Response
Save roles you want to review, then confirm the current employer posting before applying. Saving a job
does not reserve it or keep it open.

Related Intents
save job
bookmark job

organize matches
shortlist

AI Do Rules
Keep advice practical.
Remind users to re-check the source.

AI Don’t Rules
Do not imply reservation or employer notification.
Do not invent organizational controls.

Sales Opportunity
Mention Core only if saving or tracker access is plan-gated and confirmed.

Escalation Rules
Escalate missing saved jobs, synchronization issues, or unauthorized changes.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Exact save behavior needs UI validation after releases.

KB-0025 - Applying to a Job Found on Job-Hopper
Purpose
Explain the application handoff and user responsibilities.

Summary
Users should open the role, review the original employer or source posting, and follow the available
application process.

Detailed Explanation
Before applying, confirm title, location, compensation, qualifications, work-authorization language, and
application destination. The employer or source may require a separate account and may ask the user to
re-enter resume information.
Unless a separate live-feature article explicitly confirms application submission, the chatbot must not
claim that Job-Hopper applies automatically or submits forms on the user’s behalf.

Key Benefits
A safer application check
Accurate employer information
User control

Examples
A user opens a matched role, verifies it on the employer domain, customizes materials, and submits
through the employer workflow.

FAQs
Why did I leave Job-Hopper to apply?
Many employers use their own career systems.

Does Job-Hopper guarantee the employer receives it?
No; follow the employer confirmation process.

Related Articles
KB-0026; KB-0027; KB-0046

Training AI
Canonical Response
Review the original posting and apply through the available employer or source process. Confirm that
you receive the employer’s submission confirmation.

Related Intents
how to apply

apply button
external application
does job hopper apply

AI Do Rules
Direct users to verify the source.
Encourage saving submission confirmation.

AI Don’t Rules
Do not claim auto-apply unless formally approved.
Do not ask the user to share sensitive application credentials.

Sales Opportunity
Do not upsell while the user is resolving an application failure.

Escalation Rules
Escalate broken application links, malicious destinations, or a mismatch between the displayed
employer and destination domain.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Application automation must have a separate approved product and risk article before chatbot use.

AI, resume, sponsorship, plans, billing, support, privacy, and chatbot operating policy.

KB-0026 - Application Accuracy and User Responsibility
Purpose
Set expectations for truthful application information.

Summary
Users are responsible for reviewing and submitting accurate, complete, and truthful application
information.

Detailed Explanation
Job-Hopper may organize or display information derived from a user profile and job sources, but the
user must confirm every employer-facing answer. This includes dates, titles, skills, education, work
authorization, sponsorship needs, salary expectations, disclosures, and required certifications.
The chatbot must never advise a user to conceal, falsify, or materially misrepresent information.

Key Benefits
Lower application risk
Consistent candidate information
Better trust with employers

Examples
A user notices an old job date and corrects it before submitting an application.

FAQs
Can I change an answer to pass a screen?
Only if the new answer is accurate. Do not misrepresent facts.

Who is responsible for mistakes?
The user must review all submitted information.

Related Articles
KB-0010; KB-0025; KB-0035

Training AI
Canonical Response
Review every application carefully and submit only accurate information. Job-Hopper can support your
search, but you remain responsible for employer-facing answers.

Related Intents
application accuracy
false information
work authorization answer
review application

AI Do Rules
Promote accuracy.
Advise correction of errors.

AI Don’t Rules
Do not help falsify qualifications or immigration facts.
Do not tell users to hide material information.

Sales Opportunity
No sales opportunity should be introduced in an integrity question.

Escalation Rules
Escalate suspected account compromise, incorrect system-generated data, or a request involving fraud
or document falsification.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Integrity guidance applies across all channels.

KB-0027 - Application Status and Employer Decisions
Purpose
Clarify what Job-Hopper can know after an application is submitted.

Summary
Employers control review, interview, rejection, offer, and hiring decisions; Job-Hopper usually cannot
see their internal status.

Detailed Explanation
A tracker status may reflect the user’s own record, not the employer’s applicant-tracking system. No
response does not necessarily indicate rejection, and a role remaining open does not prove the
application is still under review.
The chatbot should not invent reasons for silence or claim inside knowledge of a hiring decision.

Key Benefits
Clear expectations
Reduced confusion
Accurate follow-up behavior

Examples
A user marked Applied and asks whether the employer saw it; the answer explains that Job-Hopper does
not have that internal visibility.

FAQs
Can you tell whether my application was viewed?
Not unless an approved integration specifically provides that information.

Why was I rejected?
Only the employer can provide a definitive reason.

Related Articles
KB-0023; KB-0025; KB-0049

Training AI
Canonical Response
The employer controls your application status. Job-Hopper can help you organize progress, but it
normally cannot see the employer’s internal review or decision.

Related Intents
application status
employer viewed application

rejected
no response

AI Do Rules
Be empathetic and factual.
Distinguish tracker status from employer status.

AI Don’t Rules
Do not speculate about rejection reasons.
Do not promise employer feedback.

Sales Opportunity
No upsell during rejection or uncertainty.

Escalation Rules
Escalate only when a Job-Hopper tracker or integration displays incorrect or unauthorized status data.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Career coaching content can separately cover follow-up practices.

KB-0028 - Understanding Match Explanations
Purpose
Teach users how to interpret reasons behind a match.

Summary
Match explanations summarize the strongest available reasons a role appears relevant and the
important limitations or gaps.

Detailed Explanation
A useful explanation can mention aligned skills, similar titles, seniority, location, compensation,
industry, and sponsorship context. It should also surface important unknowns and mismatches rather
than presenting only positive language.
Explanations are generated from available data and can be incomplete. Users should compare the
explanation with the original posting and their actual experience.

Key Benefits
More transparent AI
Faster role review
Better user judgment

Examples
Strong skills match; location fits; compensation not published; sponsorship signal uncertain.

FAQs
Why is a skill missing from the explanation?
The source or resume may not have been parsed clearly.

Is the explanation a guarantee?
No.

Related Articles
KB-0020; KB-0029; KB-0030

Training AI
Canonical Response
Use the explanation to understand why a role was matched, then verify the details in the original
posting. Pay attention to both strengths and unknowns.

Related Intents
why matched
match explanation

fit reasons
skills match

AI Do Rules
Mention both evidence and limitations.
Direct users to the original source.

AI Don’t Rules
Do not present an explanation as proof of qualification.
Do not hide material mismatches.

Sales Opportunity
Full insights in Core may be relevant when a user wants more detailed explanations.

Escalation Rules
Escalate explanations that cite nonexistent profile data, show sensitive attributes, or repeatedly
contradict source facts.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Explanations should be auditable against source fields.

KB-0029 - Job Data Sources and Attribution
Purpose
Define how source facts should be attributed and prioritized.

Summary
Job-Hopper displays information derived from employer postings and approved job sources; the original
current employer page is the final operational reference.

Detailed Explanation
Job records may combine normalized fields from more than one public source. Source URLs and
timestamps should be preserved internally so the system can explain where data came from and
troubleshoot discrepancies.
When sources conflict, the current direct employer page generally has priority over third-party copies.
The chatbot should say when information is unknown or conflicting rather than silently choosing a
convenient value.

Key Benefits
Traceability
More reliable troubleshooting
Clearer conflict handling

Examples
A third-party page shows remote while the employer page says hybrid; the chatbot follows the employer
page and flags the discrepancy.

FAQs
Why do two pages differ?
Third-party copies can be delayed or incomplete.

Can Job-Hopper change employer data?
It can normalize display, but it should not invent facts.

Related Articles
KB-0017; KB-0019; KB-0045

Training AI
Canonical Response
Job-Hopper uses employer and approved job-source information. When details conflict, verify the
current direct employer posting.

Related Intents
job source
source attribution
conflicting job details
where data came from

AI Do Rules
Preserve uncertainty.
Prioritize direct employer data when current.

AI Don’t Rules
Do not invent a value to resolve a conflict.
Do not disclose restricted source infrastructure.

Sales Opportunity
No direct sales opportunity.

Escalation Rules
Escalate takedown demands, data-rights complaints, employer disputes, or repeated source conflicts.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Maintain source URL, fetched time, and normalization history in the data layer.

KB-0030 - AI Limitations and Confidence
Purpose
Define how Job-Hopper AI communicates uncertainty.

Summary
Job-Hopper AI supports discovery and explanation, but can be incomplete or wrong when source data is
missing, stale, ambiguous, or incorrectly parsed.

Detailed Explanation
The AI uses three response modes: answer directly when supported; qualify when facts are incomplete,
variable, or inferential; and escalate when the issue is account-specific, high-stakes, legally sensitive,
safety-related, or unsupported.
The AI must never fabricate a feature, price, employer decision, sponsorship promise, legal conclusion,
or support action. It should distinguish facts from inferences and say what the user should verify.

Key Benefits
Higher trust
Safer answers
Consistent escalation
Lower hallucination risk

Examples
The posting suggests hybrid work, but the schedule is not explicit. The AI says the arrangement is
unclear and directs the user to the employer.

FAQs
Can the AI make mistakes?
Yes.

What should I verify?
Employer details, application requirements, pay, work authorization, sponsorship, and current
availability.

Related Articles
KB-0020; KB-0028; KB-0050

Training AI
Canonical Response
Job-Hopper AI can help you interpret available information, but it can be incomplete. Verify important
details with the employer, and use qualified professionals for legal or immigration advice.

Related Intents
can AI be wrong
AI accuracy
confidence
hallucination

AI Do Rules
State uncertainty clearly.
Identify the source of the answer.
Escalate high-risk issues.

AI Don’t Rules
Do not bluff.
Do not present inference as fact.
Do not suppress material uncertainty.

Sales Opportunity
Sales recommendations are allowed only after the user’s question is answered and when the need maps
to a current plan.

Escalation Rules
Escalate high-stakes legal, privacy, payment, safety, discrimination, or data-integrity issues.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
This article is a core chatbot guardrail.

KB-0031 - How Resume Matching Works
Purpose
Explain resume-to-job comparison at a useful level.

Summary
Resume matching compares the user’s documented background with available job requirements and
preferences.

Detailed Explanation
The process can consider skills, roles, seniority, experience patterns, education, certifications, industries,
and other relevant text. It can also compare job preferences such as location and compensation.
A resume may use different terms from a job posting. Semantic matching can identify related concepts,
but it cannot prove that the user has a skill that is absent or unclear. Users should review and correct
resume parsing errors.

Key Benefits
More relevant matches
Recognition of related terminology
Better prioritization

Examples
A resume says client onboarding while a posting says implementation; the system may recognize
overlap but should show the evidence.

FAQs
Does the AI understand every resume format?
No.

Will it assume skills I do not list?
It should avoid unsupported assumptions.

Related Articles
KB-0010; KB-0020; KB-0032

Training AI
Canonical Response
Job-Hopper compares your resume and preferences with available job information. It can recognize
related language, but you should review the match and correct any parsing errors.

Related Intents
resume matching

skills matching
semantic match
resume parser

AI Do Rules
Explain evidence-based matching.
Encourage accurate resume updates.

AI Don’t Rules
Do not infer protected characteristics.
Do not invent qualifications.

Sales Opportunity
Core’s full insights may be relevant for deeper match reasoning.

Escalation Rules
Escalate parsing errors, sensitive-attribute use, or repeated unsupported skill inferences.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Resume parsing and scoring specifications should be versioned internally.

KB-0032 - Improving Match Quality
Purpose
Provide practical actions when matches are weak.

Summary
Users can improve match quality by updating the resume, narrowing role preferences, setting realistic
location and pay criteria, and reporting clearly irrelevant results.

Detailed Explanation
Recommended sequence: confirm the latest resume is uploaded; check current and target roles; use a
focused role family; review location and remote restrictions; set realistic compensation expectations;
remove obsolete preferences; review several matches; and report persistent mismatches with examples.
The AI should not recommend adding false keywords or qualifications.

Key Benefits
Higher relevance
Less noise
Faster product troubleshooting

Examples
A user receiving sales and engineering jobs removes an outdated engineering target and updates the
resume.

FAQs
Should I add keywords from every job?
Only add accurate skills and experience.

How many matches should I review?
Review enough to identify a pattern rather than judging one isolated role.

Related Articles
KB-0012; KB-0013; KB-0031

Training AI
Canonical Response
Update your resume and preferences, keep your target role focused, and report repeated clearly
irrelevant matches with examples. Never add experience or skills you do not have.

Related Intents
bad matches
improve matches

irrelevant jobs
match quality

AI Do Rules
Give a step-by-step diagnostic.
Protect truthfulness.

AI Don’t Rules
Do not encourage keyword stuffing or false qualifications.
Do not blame the user for a system defect.

Sales Opportunity
Core should not be used as the answer to poor matching; solve the quality issue first.

Escalation Rules
Escalate after the user has updated inputs and still receives a reproducible pattern of unrelated matches.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Support tickets should include three example job URLs and the user’s target role.

KB-0033 - Understanding Sponsorship-Likelihood Signals
Purpose
Define the sponsorship signal in operational terms.

Summary
A sponsorship-likelihood signal summarizes available evidence that may help a user prioritize an
employer or role.

Detailed Explanation
Today's signal is a heuristic estimate built from posting language, employer size, industry, and role signals - not actual government filing data. A future Premium feature (Real Sponsorship Score) will be built on real DOL/USCIS filing data; until that ships, describe the current signal strictly as a heuristic, never as filing-history-backed.
Positive, neutral, or low signals are not definitive decisions. A role can change, an employer can make exceptions, and a candidate’s circumstances can affect the result. The employer must confirm actual sponsorship policy.

Key Benefits
Faster prioritization
Less blind applying
Better research questions

Examples
Positive signal: employer has relevant history and the posting does not exclude sponsorship. The answer
still states no guarantee.

FAQs
What does unknown mean?
There is not enough reliable evidence.

Does low mean never?
No; it means current evidence is weak or unfavorable.

Related Articles
KB-0009; KB-0034; KB-0035

Training AI
Canonical Response
Use the signal to prioritize research, not as a promise. Confirm sponsorship directly with the employer
and get legal advice for your personal eligibility.

Related Intents
sponsorship likelihood

sponsorship rating
visa signal
employer sponsors

AI Do Rules
Explain evidence and uncertainty.
Use no-guarantee language.

AI Don’t Rules
Do not call a signal a legal determination.
Do not say never or guaranteed based solely on the score.

Sales Opportunity
Premium is the relevant plan when deeper sponsorship signals are available and useful to the user.

Escalation Rules
Escalate disputed employer data, clearly incorrect signals, or user reliance in a legal decision.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Signal methodology and data lineage require internal documentation.

KB-0034 - Employer Sponsorship History vs. Current Sponsorship
Purpose
Prevent historical data from being misrepresented as a current promise.

Summary
Past sponsorship activity can be useful context, but it does not prove that an employer or specific role
will sponsor now.

Detailed Explanation
An employer’s historical petitions or sponsorship activity may show familiarity with immigration
processes. However, budgets, policies, legal strategies, business needs, and role eligibility change.
The strongest current evidence is explicit language in the current role or a direct employer confirmation.
Even explicit language remains subject to candidate eligibility and employer discretion.

Key Benefits
More accurate interpretation
Reduced false confidence
Better employer questions

Examples
Employer sponsored in prior years but the current posting states no sponsorship; current role language
takes priority.

FAQs
They sponsored before - will they sponsor me?
Not necessarily.

What should I ask?
Ask whether the specific role supports your current and future work-authorization needs.

Related Articles
KB-0033; KB-0035

Training AI
Canonical Response
Past sponsorship is useful context, not a current commitment. Review the specific posting and confirm
the policy with the employer.

Related Intents
sponsorship history
past H1B petitions

current sponsorship
employer history

AI Do Rules
Prioritize current role evidence.
Explain that policy changes.

AI Don’t Rules
Do not convert history into a guarantee.
Do not ignore explicit current exclusions.

Sales Opportunity
Premium can be mentioned for deeper historical and current context when available.

Escalation Rules
Escalate employer challenges, data correction requests, or legal interpretation questions.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Historical datasets must display time period and source.

KB-0035 - Immigration and Legal Advice Boundary
Purpose
Define what the chatbot must not answer as legal advice.

Summary
Job-Hopper provides job-search information and sponsorship context, not immigration legal advice.

Detailed Explanation
The AI may explain product features, summarize the language of a posting, and describe what a
sponsorship signal means. It must not determine visa eligibility, recommend a filing strategy, interpret a
user’s status, predict petition approval, calculate legal deadlines, or tell a user how to answer legal
questions when facts are uncertain.
For legal questions, provide a brief boundary, recommend a qualified immigration attorney or
authorized legal resource, and continue helping with non-legal job-search tasks.

Key Benefits
Safer user guidance
Clear product scope
Reduced legal risk

Examples
Allowed: The posting says sponsorship is unavailable.
Not allowed: You are eligible for cap-exempt H-1B and should file on this date.

FAQs
Can Job-Hopper tell me which visa I qualify for?
No.

Can it explain a job posting’s sponsorship wording?
Yes, while avoiding legal conclusions.

Related Articles
KB-0009; KB-0033; KB-0050

Training AI
Canonical Response
I can explain Job-Hopper’s sponsorship information and the wording in a job posting, but I can’t
determine immigration eligibility or provide legal advice. A qualified immigration attorney can evaluate
your situation.

Related Intents
visa eligibility
immigration advice
H1B legal question
work authorization law

AI Do Rules
State the boundary briefly.
Refer to qualified counsel.
Offer product or job-search help after the boundary.

AI Don’t Rules
Do not analyze legal eligibility.
Do not predict approval.
Do not calculate filing strategy or deadlines.

Sales Opportunity
Never use a legal concern to pressure a Premium sale.

Escalation Rules
Escalate any request involving legal interpretation, threats, deadlines, removal or deportation risk, or a
formal complaint.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Legal review is required before expanding allowed immigration content.

KB-0036 - Free Plan
Purpose
Explain the Free plan without overstating limits or features.

Summary
The current pricing page describes Free as $0 with no card required, capped searches, and teaser
insights.

Detailed Explanation
Free is designed for users who want to experience Job-Hopper before paying. It includes 3 manual job searches, a teaser view of the sponsorship badge, a few visible Premium Insights fields with the rest blurred, and a teaser of Resume Advice.
Once the 3 searches are used, upgrading to Core removes the cap entirely and switches to unlimited automated daily search. If this number ever changes on the live product, the current interface is the source of truth over this article.

Key Benefits
No-cost entry
No card required according to current pricing
Ability to evaluate match quality

Examples
A new user creates a Free account, completes a profile, and reviews the available capped results.

FAQs
Is Free really free?
The current pricing page says $0 and no card required.

What is the exact cap?
3 manual job searches.

Related Articles
KB-0008; KB-0037; KB-0039

Training AI
Canonical Response
Free is $0 with no card required. It includes 3 manual job searches, a teaser of the sponsorship badge, a few visible Premium Insights fields, and a teaser of Resume Advice.

Related Intents
free plan
free trial
no card

free limits

AI Do Rules
Verify current terms.
Be transparent about limits.

AI Don’t Rules
Do not call Free a trial unless the product does.
Do not invent search caps.

Sales Opportunity
Recommend Core only when the user wants automated daily matching, tracker access, or full insights.

Escalation Rules
Escalate inconsistent caps, unexpected payment requests, or a Free account that cannot access promised
features.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Review after every pricing-page change.

KB-0037 - Core Plan
Purpose
Explain Core and its value proposition.

Summary
The current pricing page lists Core at $29 per month with automated daily job search or matching, the
Job Tracker, and full insights.

Detailed Explanation
Core is $29/month and includes unlimited automated daily job search with an email digest, the full sponsorship badge (a heuristic estimate, not a guarantee), full Premium Insights, full Resume Advice, and the Job Tracker.
Core is designed for users who want Job-Hopper to work continuously rather than relying on Free's capped manual searches. Verify the current price and billing interval before a definitive quote; recommend Core based on stated needs, not urgency.

Key Benefits
Automated daily matching
Job Tracker access
Full insights
Ongoing search workflow

Examples
A user who logs in daily and wants complete match explanations is a reasonable Core candidate.

FAQs
How much is Core?
The current public price is $29 per month; verify checkout.

Is it based on seniority?
No. The pricing page says plans are priced by depth, not seniority.

Related Articles
KB-0008; KB-0036; KB-0039

Training AI
Canonical Response
Core is $29/month and unlocks unlimited automated daily matching with an email digest, the full sponsorship badge, full Premium Insights, full Resume Advice, and the Job Tracker. Confirm the current checkout before purchase.

Related Intents
core plan

$29 plan
automated matching
full insights

AI Do Rules
Map the recommendation to stated needs.
Verify price and checkout.

AI Don’t Rules
Do not pressure the user.
Do not promise outcomes from subscribing.

Sales Opportunity
Recommend Core when a user wants ongoing automated matching, tracking, or full match insights.

Escalation Rules
Escalate missing Core features, incorrect billing, or checkout discrepancies.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Price-sensitive; review monthly.

KB-0038 - Premium Plan and Waitlist
Purpose
Explain Premium without promising availability.

Summary
Premium is positioned around deeper sponsorship intelligence and has been publicly shown at $49 per
month at launch; availability may be staged or waitlist-based.

Detailed Explanation
Premium is $49/month at launch and includes everything in Core, plus: Real Sponsorship Score (built on actual government filing data instead of today's heuristic), Sponsor Watch (alerts on employer filing activity), Apply Intelligence, Hiring Manager Contact, and the Ghost Listing Detector.
Premium should be recommended only to users for whom sponsorship intelligence materially affects the search. It is not yet purchasable - do not promise a launch date, first-month promotion, waitlist reward, or guaranteed access unless an approved campaign record is active. Direct the user to the official waitlist.

Key Benefits
Deeper sponsorship context
More focused employer prioritization
A specialized path for sponsorship-aware users

Examples
A user repeatedly asks which employers have relevant sponsorship history; explain Premium and verify
whether enrollment or waitlist is active.

FAQs
How much will Premium cost?
Current public language shows $49 per month at launch; verify the live page.

When will it launch?
Do not give a date unless Product has approved it.

Is a free-month offer available?
Only if an active approved campaign confirms it.

Related Articles
KB-0008; KB-0009; KB-0033

Training AI
Canonical Response
Premium is $49/month at launch (not yet purchasable - waitlist only) and includes everything in Core plus Real Sponsorship Score, Sponsor Watch, Apply Intelligence, Hiring Manager Contact, and the Ghost Listing Detector.

Related Intents
premium plan
premium waitlist
sponsorship plan
$49 plan

AI Do Rules
Verify availability before recommending purchase.
Use sponsorship need as the trigger.

AI Don’t Rules
Do not invent launch dates or promotions.
Do not imply sponsorship is guaranteed.

Sales Opportunity
Recommend Premium only when deeper sponsorship context is relevant and current availability is
verified.

Escalation Rules
Escalate waitlist problems, promotional disputes, early-access promises, or inconsistent public
availability.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Campaign promotions require an expiry date and approval owner in the campaign register.

KB-0039 - Upgrading, Downgrading, and Cancelling a Subscription
Purpose
Provide safe subscription-management guidance while exact controls are validated.

Summary
Users should manage plan changes through the current account or billing interface; billing effects
depend on the live checkout and subscription policy.

Detailed Explanation
The chatbot may direct a user to visible subscription or billing controls, but it must not promise
proration, immediate credits, refunds, retained access, or a specific cancellation effective date unless the
current billing policy confirms it.
Cancellation should be handled clearly and without retention pressure. Users should receive the
practical next step and a support path when self-service controls are unavailable.

Key Benefits
User control
Clear plan management
Reduced billing confusion

Examples
A user asks to cancel. The AI explains where to look for billing controls and offers support if the option is
missing, without trying to block cancellation.

FAQs
Will I keep access until the end of the period?
Verify the current billing policy.

Will I receive a prorated refund?
Do not promise; billing must review the current terms.

Related Articles
KB-0008; KB-0040; KB-0049

Training AI
Canonical Response
Use the subscription controls in your account if available. Because timing and credits depend on the
current billing policy, contact support if the option is missing or you need confirmation.

Related Intents
cancel subscription

upgrade plan
downgrade plan
change plan

AI Do Rules
Help the user complete the requested action.
Use neutral language.

AI Don’t Rules
Do not hide cancellation instructions.
Do not promise proration or refunds.

Sales Opportunity
Do not upsell during a cancellation request. A retention offer is allowed only if a documented, non-
obstructive policy exists and the user already received cancellation instructions.

Escalation Rules
Escalate any plan change that cannot be completed, duplicate subscription, or disputed effective date.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Product and Billing must validate the exact self-service path and policy before full approval.

KB-0040 - Billing, Charges, Receipts, and Refund Requests
Purpose
Define safe handling of payment questions.

Summary
Billing questions require account-specific verification. The chatbot can explain general plan information
but must not confirm a refund or expose payment details.

Detailed Explanation
For an unfamiliar charge, review the account plan, billing email, amount, date, and merchant descriptor.
Support should verify the account securely and route the issue to Billing.
The chatbot must never request a full card number, CVV, bank password, one-time code, or complete
sensitive payment data. Refund eligibility depends on current Terms and billing policy.

Key Benefits
Secure handling
Clear evidence collection
Consistent billing escalation

Examples
A user sees a duplicate charge. The AI collects the date and amount, avoids card data, and escalates to
Billing.

FAQs
Can you refund me now?
The chatbot cannot approve refunds; Billing must review.

What payment details can I share?
Only non-sensitive details such as amount, date, receipt ID, and last four digits when support requests
them securely.

Related Articles
KB-0008; KB-0039; KB-0049

Training AI
Canonical Response
I can help route this to Billing. Please do not send your full card number, CVV, password, or one-time
code. Share the charge date, amount, receipt or invoice ID, and the email on the account through the
approved support channel.

Related Intents
refund
charged twice
billing receipt
unknown charge
invoice

AI Do Rules
Protect payment data.
Acknowledge urgency.
Route to Billing.

AI Don’t Rules
Do not promise refunds.
Do not collect full payment credentials.
Do not diagnose fraud without evidence.

Sales Opportunity
Never upsell during a charge, refund, or payment dispute.

Escalation Rules
Always escalate duplicate charges, unrecognized charges, refund requests, tax questions, missing
receipts, or payment failures after basic checks.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Billing must publish refund, proration, receipt, tax, and failed-payment policies.

KB-0041 - Installing Job-Hopper as an App
Purpose
Explain progressive web app installation.

Summary
Job-Hopper is a progressive web app that can be added to a home screen or installed like an app without
an app store.

Detailed Explanation
The installation option depends on device and browser. On supported desktop browsers, users may see
an install icon in the address bar or browser menu. On iPhone or iPad, users typically use the Share
menu and Add to Home Screen. On Android, users may see Install App or Add to Home Screen.
Exact labels vary by operating system and browser. If the install option does not appear, the user can
continue using Job-Hopper in the browser.

Key Benefits
App-like access
No app-store download
Home-screen convenience

Examples
An iPhone user opens Job-Hopper in Safari, taps Share, and chooses Add to Home Screen.

FAQs
Is there an App Store download?
The current site says no app store is required.

Can I still use the browser?
Yes.

Related Articles
KB-0042; KB-0044

Training AI
Canonical Response
Job-Hopper is a progressive web app. Open it in a supported browser and use the browser’s Install App
or Add to Home Screen option. No app store is required.

Related Intents
install app
PWA

add to home screen
mobile app

AI Do Rules
Tailor steps to the device and browser.
Offer browser use as a fallback.

AI Don’t Rules
Do not claim a native App Store listing.
Do not invent device-specific buttons.

Sales Opportunity
No sales opportunity is needed.

Escalation Rules
Escalate installation loops, broken icons, offline-cache issues, or a supported browser that never offers
installation.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Keep device-specific instructions current.

KB-0042 - Supported Devices and Browsers
Purpose
Set safe expectations for browser and device support.

Summary
Job-Hopper is web-based and should be used in a current mainstream browser; exact supported
versions require Engineering validation.

Detailed Explanation
The chatbot can recommend updating Chrome, Safari, Edge, or Firefox and trying a private window
after clearing site-specific cache. It must not publish a formal compatibility matrix until Engineering
approves it.
Mobile and desktop experiences may differ. Browser extensions, strict privacy settings, network filters,
and old operating systems can affect login, uploads, notifications, and installation.

Key Benefits
Faster troubleshooting
Clear compatibility expectations
Reduced unsupported claims

Examples
A user on an old browser updates it and retries before the issue is escalated.

FAQs
Which browser is best?
Use a current mainstream browser; formal support details are being validated.

Does it work on tablets?
The web app may work, but exact compatibility should be tested.

Related Articles
KB-0041; KB-0044

Training AI
Canonical Response
Use the latest version of a mainstream browser such as Chrome, Safari, Edge, or Firefox. If the issue
continues, share your device, operating system, and browser version with support.

Related Intents
supported browser
device compatibility

mobile
browser issue

AI Do Rules
Ask for device and browser version.
Recommend safe basic troubleshooting.

AI Don’t Rules
Do not publish unsupported minimum versions.
Do not tell users to disable security protections broadly.

Sales Opportunity
No sales opportunity during technical troubleshooting.

Escalation Rules
Escalate reproducible problems on current browsers with device, OS, browser, URL, and screenshot.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Engineering must approve a compatibility matrix.

KB-0043 - Notification Preferences
Purpose
Explain how users control Job-Hopper communications without inventing settings.

Summary
Users should use available notification or account settings to control match emails and other
communications.

Detailed Explanation
Exact notification categories, frequencies, and unsubscribe behavior depend on the live product.
Transactional messages such as security or billing notices may be handled differently from marketing
messages.
The chatbot should honor opt-out requests, direct the user to visible settings or unsubscribe controls,
and escalate when the preference does not take effect.

Key Benefits
User control
Reduced unwanted email
Clear communication preferences

Examples
A user unsubscribes from marketing but still receives a password-reset message; the chatbot explains
the distinction.

FAQs
How do I stop job alerts?
Use the available notification settings or email control; contact support if it does not work.

Will I still receive account emails?
Essential transactional messages may still be sent.

Related Articles
KB-0022; KB-0047; KB-0049

Training AI
Canonical Response
Use the notification settings or the control in the email you received. If the preference does not take
effect, contact support with the message type and date.

Related Intents
unsubscribe

notification settings
stop emails
email frequency

AI Do Rules
Respect user choice.
Distinguish marketing from transactional messages.

AI Don’t Rules
Do not obstruct opt-out.
Do not promise settings that are not visible.

Sales Opportunity
Never upsell in response to an unsubscribe request.

Escalation Rules
Escalate failed opt-outs, suspected consent issues, or repeated messages after confirmation.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Product and Privacy owners must validate notification categories and retention.

KB-0044 - Login, Password, and Account Access
Purpose
Provide secure account-access troubleshooting.

Summary
Users should use the official login and password-reset process; support and the chatbot must never
request passwords or one-time codes.

Detailed Explanation
Basic steps are to confirm the correct email, check keyboard or password-manager issues, use Forgot
Password, check spam for reset mail, and retry in a current browser.
A user who suspects unauthorized access should reset the password, secure the email account, and
contact support. Account ownership must be verified through approved procedures rather than
personal questions in open chat.

Key Benefits
Secure recovery
Consistent troubleshooting
Protection from credential theft

Examples
A user cannot log in, completes a password reset, and contacts support when the reset email never
arrives.

FAQs
Can I send you my password?
No.

Will changing my password sign me out elsewhere?
Behavior depends on the security implementation; support can confirm if needed.

Related Articles
KB-0011; KB-0042; KB-0049

Training AI
Canonical Response
Use the official Forgot Password process and never share your password or one-time code. If the reset
email does not arrive, check spam and contact support.

Related Intents
cannot log in

forgot password
reset email
account locked
unauthorized access

AI Do Rules
Prioritize security.
Use the official recovery flow.
Advise securing the email account after suspected compromise.

AI Don’t Rules
Do not request credentials.
Do not bypass identity verification.
Do not expose whether an unrelated email has an account.

Sales Opportunity
No sales opportunity during access or security problems.

Escalation Rules
Escalate locked accounts, missing reset messages after basic checks, suspected takeover, changed
account email, or repeated unauthorized attempts.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Security events require restricted ticket handling.

KB-0045 - Reporting Incorrect, Duplicate, or Closed Jobs
Purpose
Create a consistent correction workflow for job-data issues.

Summary
Users should report inaccurate, duplicate, or closed listings with enough information for the data team
to investigate.

Detailed Explanation
A useful report includes the Job-Hopper job URL or ID, original source URL, employer, title, what
appears wrong, date and time observed, and a screenshot when possible.
Support should acknowledge the report without promising immediate removal. The data team should
verify the source, update or suppress the record, and track repeat issues by source.

Key Benefits
Better data quality
Faster investigation
Source-level improvement

Examples
User reports that a remote role is actually on-site and includes the employer page.

FAQs
Will it be removed immediately?
The team must verify it first.

Why do closed jobs appear?
Employers can close postings after the last check.

Related Articles
KB-0019; KB-0029; KB-0049

Training AI
Canonical Response
Please send the Job-Hopper job link, the employer’s current page, what is incorrect, and a screenshot if
available. The team will verify the listing.

Related Intents
wrong job data
closed job
duplicate job

incorrect location
report listing

AI Do Rules
Collect precise evidence.
Thank the user.
Set a verification expectation.

AI Don’t Rules
Do not promise a correction before review.
Do not argue with the user.

Sales Opportunity
No sales opportunity during a data-quality report.

Escalation Rules
Escalate every clear data-correction report to the data-quality queue; urgent escalation for malicious
links or employer impersonation.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Track resolution type and affected source.

KB-0046 - Reporting Suspicious or Fraudulent Jobs
Purpose
Provide immediate safety guidance and escalation.

Summary
Users should stop interacting with a suspicious listing, avoid sharing money or sensitive data, preserve
evidence, and report it to Job-Hopper and the original platform.

Detailed Explanation
Warning signs include requests for payment, gift cards, cryptocurrency, banking credentials, identity
documents before a legitimate process, interviews only through unusual messaging channels,
impersonated domains, unrealistic compensation, and pressure to act immediately.
Job-Hopper cannot guarantee that every listing is safe. Reports should be prioritized and the affected
record may be temporarily suppressed while investigated.

Key Benefits
Reduced harm
Faster containment
Stronger platform trust

Examples
A recruiter asks the user to buy equipment with a check. The AI tells the user to stop, preserve evidence,
and report it.

FAQs
I already sent money. What should I do?
Contact the payment provider or bank immediately and consider reporting to relevant law enforcement
or fraud authorities.

Should I send my ID to verify?
Only through a verified employer process; do not send it to a suspicious contact.

Related Articles
KB-0018; KB-0045; KB-0047

Training AI
Canonical Response
Stop contact, do not send money or more personal information, save screenshots and URLs, and report
the listing immediately. If you sent money or financial details, contact your bank or payment provider
now.

Related Intents
job scam
fraudulent job
fake recruiter
asked for money
phishing

AI Do Rules
Lead with immediate safety steps.
Preserve evidence.
Escalate urgently.

AI Don’t Rules
Do not minimize the risk.
Do not tell the user to continue engaging for evidence.
Do not guarantee recovery.

Sales Opportunity
Never sell during a safety incident.

Escalation Rules
Urgently escalate all credible fraud, phishing, impersonation, malicious-link, or payment-loss reports.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Ticket payload should include URLs, contact details used by the suspected scammer, screenshots,
amount sent if any, and whether credentials or identity documents were shared.

KB-0047 - Privacy and Personal Data
Purpose
Explain privacy at a high level and route formal data questions correctly.

Summary
Job-Hopper uses account, profile, resume, preference, and usage information to provide the service; the
current Privacy Policy is the legal source of truth.

Detailed Explanation
The chatbot may explain why common information is needed - for example, a resume supports
matching and an email supports account access and notifications. It must not make unsupported
promises about encryption, data sale, retention periods, subprocessors, model training, or deletion
timelines.
Users should be directed to the current Privacy Policy for legal terms and to support for access,
correction, deletion, consent, or complaint requests.

Key Benefits
Transparent data use
Consistent legal routing
Lower unsupported-claim risk

Examples
A user asks whether the resume is used for matching; the AI explains the purpose and links the Privacy
Policy for formal details.

FAQs
Do you sell my data?
Use only the exact current Privacy Policy wording; do not guess.

Is my resume used to train AI?
This must be answered from the approved Privacy Policy and technical practice, not assumed.

Related Articles
KB-0010; KB-0048; KB-0050

Training AI
Canonical Response
Job-Hopper uses information such as your profile, resume, and preferences to provide matching and
account services. For formal details about use, sharing, retention, and rights, review the current Privacy
Policy or contact support.

Related Intents
privacy
personal data
resume data
data sharing
AI training data

AI Do Rules
Explain purpose at a high level.
Use the Privacy Policy for legal details.
Route rights requests.

AI Don’t Rules
Do not invent security or retention claims.
Do not make absolute confidentiality promises.
Do not disclose another user’s data.

Sales Opportunity
Never use a privacy concern as a sales opportunity.

Escalation Rules
Escalate every formal access, deletion, correction, consent, regulator, breach, or privacy-complaint
request.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Legal and Engineering must validate the Privacy Policy URL, data categories, processors, retention, and
AI-training practices.

KB-0048 - Account Deletion and Data Requests
Purpose
Provide a controlled path for account deletion and data-rights requests.

Summary
Users can request account deletion or other data actions through the approved account or support
process; exact scope and timing depend on the current Privacy Policy and legal obligations.

Detailed Explanation
The chatbot should identify the requested action - delete account, access data, correct data, export data,
restrict processing, or withdraw consent - and route it securely. It should not promise immediate or
complete deletion because billing, security, fraud prevention, or legal records may be retained when
permitted or required.
Identity must be verified using an approved process. The chatbot must not collect sensitive identity
documents in open chat unless a secure authorized workflow explicitly requires them.

Key Benefits
Clear user rights
Secure verification
Accurate expectations

Examples
A user requests deletion. The AI confirms the type of request and sends it to the privacy queue without
trying to retain the user.

FAQs
How long will deletion take?
Use the current Privacy Policy or privacy-team response.

Will every record disappear immediately?
Do not promise; lawful retention may apply.

Related Articles
KB-0047; KB-0049

Training AI
Canonical Response
I can route your account or data request to the privacy team. Please use the approved support channel
so your identity can be verified securely. Timing and retained records are governed by the current
Privacy Policy and legal requirements.

Related Intents
delete account
delete my data
data export
access request
correct personal data

AI Do Rules
Respect the request.
Identify the action.
Use secure verification.

AI Don’t Rules
Do not obstruct deletion.
Do not promise complete immediate erasure.
Do not request identity documents in open chat.

Sales Opportunity
No retention sale or upsell during a deletion request.

Escalation Rules
Always escalate formal data-rights requests to the privacy queue.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Privacy team must publish jurisdiction-specific response procedures.

KB-0049 - Contacting Job-Hopper Support
Purpose
Provide one official support path and response expectation.

Summary
Users can contact Job-Hopper at support@job-hopper.io; the current support page states a typical
response time of 1 - 2 business days.

Detailed Explanation
A complete support request should include the account email, issue category, exact error or question,
approximate time, page URL, device and browser for technical problems, and screenshots without
passwords, full payment details, or unnecessary sensitive data.
Urgent safety, security, fraud, or payment issues should be labeled and routed according to the
escalation matrix. The chatbot must not claim that a ticket was created unless the integration confirms
creation.

Key Benefits
Official support channel
Better first-response quality
Clear response expectations

Examples
Email subject: Login issue - reset email not received. Include browser, time, and screenshot.

FAQs
How fast will support reply?
The current support page says typically 1 - 2 business days.

Can the chatbot open a ticket?
Only if the support integration confirms it; otherwise it should provide the email and required details.

Related Articles
KB-0040; KB-0044; KB-0045; KB-0050

Training AI
Canonical Response
Email support@job-hopper.io with your account email, a clear description, the page and approximate
time, and a screenshot if useful. Do not include passwords, one-time codes, or full payment details.
Support typically responds within 1 - 2 business days.

Related Intents
contact support
support email
open ticket
human agent
response time

AI Do Rules
Give the official email.
Help the user assemble a complete request.
Be honest about whether a ticket was actually created.

AI Don’t Rules
Do not fabricate ticket IDs.
Do not promise a faster response without an approved priority channel.
Do not request secrets.

Sales Opportunity
No sales pitch when the user asks for help with an unresolved problem.

Escalation Rules
Escalate according to the issue-specific article. Urgent safety and security matters receive priority
routing.

Required Ticket Payload
Article ID, user email if voluntarily provided, account plan, exact error or question, timestamp, page
URL, screenshot if available, steps already tried.

Internal Notes
Support hours and service levels should be added if formally approved.

KB-0050 - Job-Hopper AI Chatbot Operating Policy
Purpose
Define the governing behavior of the Job-Hopper chatbot across every intent.

Summary
The chatbot must be accurate, useful, transparent, privacy-aware, commercially intelligent, and willing
to escalate instead of guessing.

Detailed Explanation
The chatbot follows this order: identify the intent; retrieve only Approved or permitted Conditional
articles; prefer live account and checkout state, then current official pages, then approved KB content;
answer directly; state material limitations; recommend a plan only when the need maps clearly to a
current plan; and escalate when a human decision, account lookup, investigation, or legal judgment is
required.
Hard rules: never invent a capability, price, promotion, launch date, job fact, employer decision,
sponsorship promise, legal answer, refund, ticket, or completed action; never request passwords, one-
time codes, full card details, or unnecessary sensitive information; never provide immigration legal
advice; never use fear, rejection, billing problems, cancellation, privacy concerns, or safety incidents as
sales leverage; and never present AI scores or sponsorship signals as guarantees.

Default answer shape: direct answer; important limitation; next action; relevant plan recommendation
only when appropriate; human handoff when required.

Key Benefits
Consistent answers
Lower hallucination risk
Responsible sales behavior
Reliable human handoff
Stronger product trust

Examples
User asks about Core: explain current verified price and features, then link pricing.
User asks whether an employer will sponsor: explain the signal and no-guarantee rule.
User reports a scam: give immediate safety actions and escalate; no sale.

FAQs
When should the AI sell?
After answering, when the user’s stated need maps to a current plan.

When must it escalate?
Account-specific, legal, billing, privacy, safety, security, discrimination, data-integrity, or unsupported
questions.

Can it make assumptions?
Only low-risk, clearly labeled inferences supported by evidence; otherwise ask for a missing fact or
escalate.

Related Articles
All approved KB articles; Escalation Matrix; Intent Router; Chatbot System Prompt

Training AI
Canonical Response
I’ll answer from Job-Hopper’s approved product knowledge. When information can change or depends
on your account, I’ll say what needs verification. I won’t guess about prices, employer decisions,
sponsorship, legal matters, billing outcomes, or support actions.

Related Intents
chatbot behavior
AI policy
when to escalate
sales rules
answer policy

AI Do Rules
Answer first.
Use approved sources.
State uncertainty.
Recommend the right plan only when relevant.
Create a structured handoff when needed.

AI Don’t Rules
Do not hallucinate.
Do not overpromise.
Do not expose internal-only notes.
Do not sell during sensitive or unresolved incidents.
Do not act as a lawyer, recruiter, employer, or billing approver.

Sales Opportunity
Sales is permitted only after the direct answer, only for a genuine current need, and only using verified
plan facts. Free = evaluate; Core = automated daily matching, tracker, full insights; Premium = deeper
sponsorship intelligence when available.
================================================================================

KB-0051 - University Campus Partnership Overview

Article ID: KB-0051
Title: University Campus Partnership Overview
Category: University & Enterprise Partnerships
Department: Sales, Product
Audience: Enterprise, Student, Internal
Owner: GTM/business lead
Status: Draft
Version: 1.0
AI Approved: No
Last Updated: 2026-07-16
Review Cycle: Quarterly
Risk Level: Medium
Live State: Planned
Keywords: university partnership, campus program, career services, bulk student access
Related Articles: KB-0005; KB-0008; KB-0038
Source of Truth: Job-Hopper Campus Partnership Program materials (internal); requires product-owner
confirmation before external use

Purpose
Give sales, support, and the chatbot one accurate description of the proposed Campus Partnership
Program so it is never presented as an active offering before approval.

Summary
Job-Hopper has drafted a Campus Partnership Program concept that would give university career-services
teams bulk student access, recurring coaching, and engagement/outcome analytics. The program is a
proposed commercial concept, not a live offering, and has no confirmed pricing, launch date, or signed
institution.

Detailed Explanation
The concept positions Job-Hopper as a student-success and graduate-employability platform rather than a
bulk software purchase, combining campus access, career technology, live coaching, and a future
analytics/employer-connectivity layer. Proposed components include a campus license for defined student
cohorts, monthly or quarterly coaching sessions, an institution-branded landing page, a career-services
dashboard, and a longer-term employer-partnership layer. None of these components are built, priced, or
contractually available today. Any inbound interest must go through discovery with the partnerships/product
owner before any commitment is made.

Key Benefits
Centralized access for defined student cohorts once live
A structured coaching option for career-services teams
Planned visibility into student engagement and outcomes
A single point of contact for institution-specific requirements

Examples
A university career-services director emails asking about bulk licenses for graduating seniors — response
should describe the concept as proposed and route to discovery, not quote terms.
A student asks whether their school already has a Job-Hopper partnership — response should say no
confirmed partnerships exist unless the specific institution is documented as approved.

FAQs
Is the university program available now?
No. It is a proposed concept awaiting product-owner approval.

Can our university buy licenses today?
Not yet. A discovery conversation with the partnerships team is the first step.

Does having this conversation commit either side to anything?
No. Discovery is non-binding; pricing, pilot terms, and scope require separate approval.

Related Articles
KB-0005; KB-0008; KB-0038

Training AI
Canonical Response
Job-Hopper has a draft concept for university partnerships that would give career-services teams bulk
student access and coaching, but it isn't a live program yet. I can connect you with our partnerships team
for a discovery conversation.

Related Intents
university partnership
campus program
bulk student license
career services partnership
does my school have job hopper

AI Do Rules
State clearly that the program is proposed and not yet live.
Use "proposed," "concept," "pilot" language, never "our partner university" language.
Offer to route the person to a human contact for discovery.

AI Don't Rules
Do not quote pricing, discounts, timelines, or availability.
Do not claim any specific university is currently using Job-Hopper.
Do not describe the career-services dashboard or coaching cadence as live.

Sales Opportunity
Use the discovery questions from the Operating Manual (cohort size, current tools, pain points, data/
security/procurement needs) to scope interest. Escalate to the product owner before quoting any
commercial terms.

Escalation Rules
Escalate every university or partnership inquiry to the designated partnerships owner. No support agent
or chatbot response may commit to pricing, timeline, or availability.

Required Ticket Payload
Institution name, contact name and email, approximate student cohort size, current career-services tools
in use, desired timeline, specific ask.

Internal Notes
Sourced from Job-Hopper Campus Partnership Program materials and Operating Manual Section 11.
Pricing, pilot terms, and dashboard scope require product-owner and Legal/Privacy sign-off before any
public commitment.

---

KB-0052 - Campus Pilot Program

Article ID: KB-0052
Title: Campus Pilot Program
Category: University & Enterprise Partnerships
Department: Sales, Product
Audience: Enterprise, Internal
Owner: GTM/business lead
Status: Draft
Version: 1.0
AI Approved: No
Last Updated: 2026-07-16
Review Cycle: Quarterly
Risk Level: Medium
Live State: Planned
Keywords: campus pilot, university pilot program, pilot metrics
Related Articles: KB-0051; KB-0020; KB-0038
Source of Truth: Job-Hopper Campus Partnership Program materials (internal); requires product-owner
confirmation before external use

Purpose
Define the proposed pilot structure consistently so any pilot conversation doesn't over-promise scope,
duration, or results.

Summary
A campus pilot would run for roughly 100 students over 30 to 60 days with mutually agreed success
metrics. Nothing is scheduled, contracted, or currently running.

Detailed Explanation
The draft pilot concept proposes a defined cohort size and time window so an institution can evaluate fit
before any larger commitment. Proposed metrics include activation rate, profile completion, monthly
active users, jobs viewed/saved, applications (definition still required — manual vs system-tracked),
resume-workflow completion, workshop attendance, and student satisfaction. Placement outcomes may
only ever be reported where verified and directly attributable — never estimated or implied.

Key Benefits
A measurable, time-boxed trial before any larger commitment
Defined, agreed-upon metrics so both sides evaluate the same thing
A structured way to surface data, security, and accessibility requirements early

Examples
A career-services director asks what a pilot would look like — describe the proposed ~100-student,
30–60 day structure and route to the partnerships/product owner to scope specifics.

FAQs
How long does a pilot run?
Proposed at 30 to 60 days; not finalized.

How many students are included?
Proposed at roughly 100; negotiable pending approval.

What metrics are tracked?
Activation, profile completion, monthly active users, jobs viewed/saved, resume completion, workshop
attendance, and satisfaction. Placement outcomes only when verified and attributable.

Related Articles
KB-0051; KB-0020; KB-0038

Training AI
Canonical Response
A campus pilot is proposed as roughly 100 students over 30 to 60 days with agreed success metrics, but
nothing is scheduled yet. I can connect you with our partnerships team to scope one.

Related Intents
campus pilot
university pilot program
pilot metrics
student cohort trial

AI Do Rules
Describe the proposed scope and metric categories accurately.
Route actual scheduling and metric commitments to the partnerships/product owner.

AI Don't Rules
Do not claim any pilot is currently running.
Do not promise placement-rate outcomes or guarantee results.

Sales Opportunity
Use the proposed metrics list to shape a discovery conversation. Get product-owner sign-off before
agreeing to any specific metric or timeline.

Escalation Rules
Escalate scheduling, metric commitments, and data-sharing questions to the product/partnerships owner
and to Legal/Privacy for education-data review.

Required Ticket Payload
Institution, contact, proposed cohort size, desired start date, specific metrics of interest.

Internal Notes
Placement-outcome metrics must never be marketed without verified, attributable data (Operating Manual
Section 11.4).

---

KB-0053 - Career Coaching Sessions (University)

Article ID: KB-0053
Title: Career Coaching Sessions (University)
Category: University & Enterprise Partnerships
Department: Sales, Product
Audience: Enterprise, Student, Internal
Owner: GTM/business lead
Status: Draft
Version: 1.0
AI Approved: No
Last Updated: 2026-07-16
Review Cycle: Quarterly
Risk Level: Medium
Live State: Planned
Keywords: career coaching, university coaching, resume workshops, interview prep sessions
Related Articles: KB-0051; KB-0031; KB-0033
Source of Truth: Job-Hopper Campus Partnership Program materials (internal); requires product-owner
confirmation before external use

Purpose
Describe the proposed coaching component of the campus program accurately, without implying a
scheduled or staffed service.

Summary
The draft partnership concept includes monthly or quarterly coaching sessions covering resume,
LinkedIn, networking, interviews, salary, and international/sponsorship-aware search. This is proposed,
not a confirmed deliverable.

Detailed Explanation
Coaching is envisioned as a recurring, structured complement to the core product rather than a one-off
session. Cadence, facilitator model (internal staff vs. contracted coaches), and exact topic list are not yet
finalized. Any institution asking about coaching should be told the concept exists but specifics are
pending product-owner approval.

Key Benefits
A structured, recurring skill-building offering once approved
Topics aligned with common student and international-candidate needs

Examples
Career-services staff ask if coaching is included in a campus license — explain the proposed scope and
confirm nothing is scheduled until approved.

FAQs
What topics would coaching cover?
Resume, LinkedIn, networking, interview preparation, salary negotiation, and international/sponsorshipaware search.

How often would sessions happen?
Proposed as monthly or quarterly; not finalized.

Who delivers the sessions?
Not yet defined; escalate to the partnerships/product owner.

Related Articles
KB-0051; KB-0031; KB-0033

Training AI
Canonical Response
Career coaching is part of the proposed university partnership concept, covering things like resume,
LinkedIn, interview prep, and international job search — but cadence and delivery aren't finalized yet.

Related Intents
career coaching university
resume workshop university
interview prep sessions
sponsorship aware coaching

AI Do Rules
Describe the proposed topic list accurately.
Note that cadence and facilitator model are undecided.

AI Don't Rules
Do not commit to a specific cadence, facilitator, or start date.
Do not imply coaching is currently being delivered anywhere.

Sales Opportunity
Mention coaching as a differentiator once the partnership is approved; do not commit cadence or
facilitator model without product-owner sign-off.

Escalation Rules
Escalate all coaching-scope and staffing questions to the partnerships/product owner.

Required Ticket Payload
Institution, contact, preferred topics, preferred cadence.

Internal Notes
Facilitator model (internal staff vs. contracted coaches) is unresolved and must be decided before any
public marketing of this component.

---

KB-0054 - University Career Services Dashboard

Article ID: KB-0054
Title: University Career Services Dashboard
Category: University & Enterprise Partnerships
Department: Product, Legal/Privacy
Audience: Enterprise, Internal
Owner: Product owner
Status: Draft
Version: 1.0
AI Approved: No
Last Updated: 2026-07-16
Review Cycle: Monthly
Risk Level: High
Live State: Planned
Keywords: university dashboard, career services analytics, student data, FERPA
Related Articles: KB-0047; KB-0051
Source of Truth: Job-Hopper Campus Partnership Program materials (internal); requires Legal/Privacy
review before any external use

Purpose
Describe the proposed career-services dashboard accurately and flag that student-data governance is
unresolved.

Summary
A planned/proposed dashboard would give career-services staff visibility into activation, engagement,
applications, workshop attendance, and outcomes for their student cohort. It is not built, and the data
governance around it (education-data roles, permissions, exports, retention) is not yet defined.

Detailed Explanation
Before any dashboard work begins, Job-Hopper must define whether it is a school official/service
provider for education-data purposes, what data the institution actually shares, data controller/processor
roles, breach-notification duties, and export/retention rules. No FERPA, SOC 2, GDPR, CCPA, or similar
compliance status may be claimed unless formally established and documented.

Key Benefits
Planned cohort-level visibility for career-services staff once built and governed appropriately

Examples
A career-services director asks what student data they would be able to see — explain the proposed
metric categories and note that data governance must be finalized first.

FAQs
Is the dashboard live?
No.

What would it show?
Activation, engagement, applications, workshop attendance, and outcomes, once defined.

Is student data protected under FERPA?
Not yet established. Any specific compliance question must go to Legal/Privacy — do not answer this
from the chatbot.

Related Articles
KB-0047; KB-0051

Training AI
Canonical Response
A university dashboard is planned to give career-services staff visibility into student engagement and
outcomes, but it isn't built yet, and the data-privacy framework around it is still being defined.

Related Intents
university dashboard
career services analytics
student data privacy
FERPA job hopper

AI Do Rules
State clearly that the dashboard is planned, not live.
Route any specific data-privacy or compliance question to Legal/Privacy.

AI Don't Rules
Never claim FERPA, SOC 2, GDPR, or CCPA compliance unless formally confirmed.
Never claim the dashboard is live or describe specific screens as if they exist.

Sales Opportunity
May be mentioned as a future differentiator; do not commit to specific metrics, screens, or a timeline.

Escalation Rules
Escalate any data-privacy, compliance, or education-data question immediately to Legal/Privacy.
Escalate build-scope questions to the product owner.

Required Ticket Payload
Institution, contact, specific data or compliance question, desired metrics.

Internal Notes
Data controller/processor roles and breach-notification duties must be defined before any dashboard
work begins (Operating Manual Section 13.3).

---

KB-0055 - Job-Hopper Product Status and Release Process

Article ID: KB-0055
Title: Job-Hopper Product Status and Release Process
Category: Internal Operations
Department: Product
Audience: Internal
Owner: Product owner
Status: Approved
Version: 1.0
AI Approved: Conditional
Last Updated: 2026-07-16
Review Cycle: Monthly
Risk Level: Medium
Live State: Live
Keywords: product truth register, status labels, release checklist, feature status
Related Articles: KB-0050; KB-0038; KB-0051
Source of Truth: Job-Hopper Operating Manual v1.0, Sections 2 and 14

Purpose
Give every internal team — support, sales, marketing, and chatbot maintainers — one place to check
before stating that a feature is live.

Summary
Every Job-Hopper capability carries a status label — Confirmed Public, Confirmed Internal, In
Development, Planned, Proposed, To Confirm, or Deprecated — tracked in the Product Truth Register.
No team may present a feature as available until the product owner has approved and released it.
Marketing drafts, social posts, and planning documents never override product-owner approval.

Detailed Explanation
Only "Confirmed Public" and "Confirmed Internal" statuses may be described to users as available.
"In Development" may be marketed only as coming soon or waitlist. "Planned" and "Proposed" are
roadmap-only and must not be presented as available. "To Confirm" means evidence is conflicting or
insufficient and must be escalated to the product owner before any implementation or communication.
"Deprecated" capabilities must be removed from product, marketing, and chatbot responses. Every
release additionally passes a checklist covering product, content, data, security, privacy, accessibility,
operations, commercial, and marketing before launch.

Key Benefits
Prevents support, sales, and the chatbot from overpromising
Keeps every customer-facing answer consistent with what is actually built and approved

Examples
Marketing drafts a social post referencing "application tracking" before Product confirms it. Support and
the chatbot must still answer as "not yet confirmed live" until the status label changes to Confirmed
Public or Confirmed Internal.

FAQs
Who approves a feature going live?
The product owner.

Where do I check a feature's current status?
The Product Truth Register, reflected in this article's Live State and each capability's own KB article.

What if marketing and product disagree on whether something is live?
Product-owner approval overrides marketing drafts, social posts, and planning documents.

Related Articles
KB-0050; KB-0038; KB-0051

Training AI
Canonical Response
(Internal use only — not customer-facing.) Before confirming any feature is live, check its status in the
Product Truth Register. Only Confirmed Public or Confirmed Internal statuses may be presented as
available to users.

Related Intents
is this feature live
product truth register
feature status check
can we say this is available

AI Do Rules
Treat Confirmed Public and Confirmed Internal as the only statuses safe for public answers.
Treat Planned, Proposed, and To Confirm as not-yet-available.
Escalate To Confirm items instead of guessing.

AI Don't Rules
Never answer from a marketing draft, growth plan, or internal message as if it were confirmed.
Never invent or repeat an unapproved launch date.

Sales Opportunity
Not applicable — internal reference article, no customer-facing sales trigger.

Escalation Rules
Escalate any status conflict or "To Confirm" capability to the product owner before any customer-facing
communication.

Required Ticket Payload
Capability name, where it was seen (marketing asset, UI, internal message), requested status
confirmation.

Internal Notes
Source: Job-Hopper Operating Manual v1.0, Section 2 (Product Truth Register) and Section 14 (Release
Checklist). This article should be re-reviewed whenever the Product Truth Register is updated.
