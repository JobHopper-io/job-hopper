# "Visible to Recruiters, Invisible to Your Employer" mode (proposal)

Status: **not built**. This document sketches what the feature is, how LinkedIn/Indeed
do the equivalent, what it would take to build here, and what could layer on top later.
Nothing below is committed — treat it as a design starting point.

## What it is

A privacy-safe opt-in that makes a job seeker's profile discoverable to employers/recruiters
searching the platform, without that signal ever reaching the seeker's current employer.
It's the inverse of [Premium Insights](premium-insights-tier-contact-depth.md) (which today
lets seekers discover companies/contacts) — here, companies discover seekers.

## What it does

- Seeker opts in with an explicit toggle (default off).
- Opted-in profiles become searchable by employer/recruiter accounts: title, skills,
  experience level, general location — no name, resume, or direct contact info up front.
- The seeker's own current employer is excluded from ever matching that profile in search,
  regardless of who at that company is searching.
- Presumably a reveal/contact step exists further down the funnel (employer requests
  intro → seeker approves → contact info shared), mirroring how Premium Insights gates
  contact depth by tier.

## The prerequisite gap: there is no employer side today

Before any of the mechanics below matter: **this app has no employer-facing accounts,
auth, or search surface.** The existing `employers` table is scraped company data used
for Apollo org matching (`employers.domain`) — not a login, not a user type. Every
feature to date (Free/Core/Premium tiers, Premium Insights, Sponsor Watch) is seeker-side
only, reachable via the existing Supabase Auth + `profiles` model.

So "build this feature" really means two very differently-sized pieces of work:

1. **Seeker-side opt-in + exclusion list** — small, schema-only, can ship standalone.
2. **Employer-side account type, auth, and search UI** — a new product surface: who can
   create an employer account (self-serve? verified company domain? sales-assisted?),
   what they pay for, what search/filter UX they get. This is comparable in scope to
   building a second app, not a feature flag on the existing one.

Piece 1 is worth doing now if there's product conviction; piece 2 should stay a separate,
later decision gated on actual employer-side demand/GTM, not bundled into this doc's scope.

## How LinkedIn and Indeed do the privacy mechanic

| | Mechanism | Current-employer exclusion |
|---|---|---|
| **LinkedIn** ("Open to Work — recruiters only") | Internal `openToWork` flag on the profile, visible only to accounts holding a Recruiter/Hiring seat | Equality check: recruiter's own account company vs. the profile's listed "Current company." If they match, the badge/signal is suppressed for that viewer. Doesn't catch a colleague searching from a personal (non-Recruiter) account — LinkedIn accepts that gap. |
| **Indeed** (resume visibility) | Tri-state: Public / Private / visible-to-employers-except-list | Seeker explicitly types company names into a block-list; Indeed also auto-suggests blocking whatever employer is listed as the most recent entry on the resume. |

Both reduce to the same primitive: **store the seeker's current employer as a normalized
identity, and filter it out of the recruiter-facing search index at query time.** The
open design question isn't the filtering logic (that's a `WHERE employer_id != X` or a
`NOT IN (excluded_list)`), it's **how you know "current employer" reliably**:

- Self-reported free text — cheap, but gameable/typo-prone (misses "Acme Corp" vs "Acme").
- Domain-matched against the `employers` table (same table Apollo org-matching already
  uses `employers.domain` for) — more reliable, reuses existing infra, but requires the
  seeker to actually have a structured "current employer" field, which `profiles` doesn't
  have today (work history currently only lives inside the uploaded resume file).
- LinkedIn's approach (match against the *searching* recruiter's own account company) —
  only works once employer accounts exist and are tied to a verified company identity.

## Minimal buildable version (seeker-side only)

If the goal is to lay groundwork now without committing to the employer surface:

- `profiles.recruiter_visible boolean default false` — the opt-in toggle.
- `profiles.current_employer_id references employers(id)` (nullable) — structured current
  employer, resolved the same way Premium Insights already resolves org identity via
  Apollo/`employers.domain`. Until this exists, recruiter search can't reliably exclude
  anyone, so this field is the actual prerequisite, not the toggle.
- `recruiter_exclusions (profile_id, employer_id)` — optional explicit block-list beyond
  the auto-detected current employer, matching Indeed's belt-and-suspenders approach.
- No new edge function needed yet — this is just schema + a settings-page toggle, in the
  same shape as other tier/preference flags already on `profiles`.

Everything past this (search index, matching, reveal flow, employer auth) depends on the
employer-surface decision above.

## Features that could layer on later

- **Staged reveal**: employer sees anonymized card first → requests intro → seeker
  approves → contact info shared. Reuses the approve/reveal shape Premium Insights
  already has on the seeker→company direction, mirrored.
- **Tiered visibility**: e.g. Premium seekers surface higher in employer search results,
  the mirror image of Premium's existing contact-depth gating
  (`resolveBaseTier`: free/core/premium → 1/2/3 contacts).
- **Search-side exclusion audit log**: record every excluded-match event so a seeker can
  verify their employer was actually filtered, not just trust the toggle.
- **Time-boxed visibility**: auto-disable after N days of inactivity, LinkedIn-style,
  instead of a permanent toggle.
- **Multiple excluded employers**: past employers, or employers a seeker distrusts
  (recruiter at a competitor, notoriously leaky HR dept), not just the current one.
- **Employer-initiated messaging cap**: rate-limit or credit-gate employer→seeker
  outreach the same way Apollo credits are budgeted per process today
  ([apollo-limits.md](apollo-limits.md)) — prevents the search feature from becoming a
  spam vector on day one.

## Open questions before scoping real work

- Is there employer-side demand/GTM lined up, or is this speculative? This determines
  whether piece 2 (employer accounts + search) is worth building at all right now.
- Where does "current employer" get sourced from if not a structured profile field —
  resume parsing? manual entry at opt-in time?
- What does an employer account holder actually pay for, and does that fit the existing
  Stripe product/subscription model or need its own?
