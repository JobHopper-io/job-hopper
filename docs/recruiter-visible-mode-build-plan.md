# Recruiter-Visible Mode — Build Plan

Owner: Subaina Monib. This is the approved phased build plan (supersedes the earlier
[decision-memo framing](recruiter-visibility-mode.md), which stays as background/precedent
reading — LinkedIn/Indeed comparison, initial scope split).

## 1. Product vision & core differentiator

Today Job-Hopper only works in one direction: seekers find jobs. This feature adds the
reverse — employers can find seekers — without ever compromising the trust the product is
built on. A seeker opts in, becomes discoverable to employers searching the platform, and
can be found and contacted, but their own current employer can never see them in that
search, no matter who at that company is looking.

This mirrors what LinkedIn and Indeed already do (LinkedIn's "Open to Work, recruiters
only," Indeed's private-except-list resume visibility), so the concept is proven. What's
new for Job-Hopper is that we currently have **zero employer-facing product at all** — no
employer accounts, no employer login, no way for a company to interact with the platform.
This plan builds that from scratch, alongside the seeker-side privacy mechanics.

**Reality check:** this is genuinely a second product living inside Job-Hopper, not a
feature flag on the existing one. Every table, login, and screen shipped so far assumes the
person using it is a job seeker. This plan treats the employer side with that same weight.

## 2. Roadmap overview

| Phase | Focus | Key deliverable |
|---|---|---|
| Phase 1 | Seeker-side groundwork | Opt-in toggle live, ready for employers to search against |
| Phase 2 | Employer accounts & verification | Companies can sign up and log in |
| Phase 3 | Candidate search | Employers can search and browse anonymized candidates |
| Phase 4 | Reveal & approval flow | Employers can request contact; seekers approve or decline |
| Phase 5 | Billing & access tiers | Employers can actually pay for access |
| Phase 6 | Admin, trust & launch | Moderation tools, abuse protection, public rollout |

## 3. Phase 1: Seeker-side groundwork

Focus: give seekers the privacy control before anything employer-facing exists, so it's
ready the moment employers can search.

- Add an opt-in toggle to profile settings ("make me visible to recruiters"), off by default.
- Add a simple field where a seeker tells us who they currently work for, so we know who to
  exclude later.
- Update the settings page so this sits naturally next to existing preferences.

## 4. Phase 2: Employer accounts & verification

Focus: give companies a front door to the product for the first time.

- Build employer sign-up: company name, work email, basic account creation.
- Verify that an employer is who they say they are, starting with the simplest reliable
  method (matching their email domain to their claimed company) and adding manual review
  only for edge cases.
- Build a separate employer login experience, cleanly split from the seeker side so there's
  no confusion about which type of account someone has.

## 5. Phase 3: Candidate search

Focus: the actual discovery experience — this is the first employer-visible payoff.

- Build a search and filter experience for employers: role, experience level, general
  location, and similar criteria.
- Every result is anonymized — title, experience, general location, skills — never a name,
  resume, or contact info at this stage.
- Automatically exclude any seeker whose listed current employer matches the company doing
  the searching, so no one can ever be found by their own employer.

## 6. Phase 4: Reveal & approval flow

Focus: turning "found in search" into an actual introduction, with the seeker always in
control.

- Employers can send a request to learn more about a specific anonymized candidate.
- The seeker gets notified and must explicitly approve or decline before anything is
  revealed — nothing is ever shared automatically.
- On approval, the employer receives contact details; on decline, nothing changes and the
  employer isn't told why.
- Seekers get a simple inbox to manage these requests, similar to how they already manage
  other in-app activity.

## 7. Phase 5: Billing & access tiers

Focus: making the employer side a real revenue line, not just a free tool.

- Decide and implement how employers pay — most likely a flat monthly access fee to start
  (simplest to launch, easiest to explain), with the option to add usage-based pricing later
  once we know real usage patterns.
- Gate search and reveal-request access behind an active employer subscription, the same way
  seeker tiers already gate features today.
- Reuse existing billing infrastructure rather than building a separate system.

## 8. Phase 6: Admin, trust & launch

Focus: the guardrails needed before this is open to the public.

- Give admins a way to review and approve/reject employer accounts, and to suspend bad
  actors.
- Keep a record of every search and reveal request so a seeker can verify their employer was
  genuinely excluded, not just told to trust it.
- Add limits so no employer can mass-search or spam reveal requests.
- Update the public-facing FAQ and privacy language to reflect that this feature now exists,
  and exactly what it does and doesn't share.
- Decide whether to soft-launch with a small number of hand-picked employers first, or open
  signup broadly right away.

## 9. Open decisions

- **Pricing model** — flat monthly fee vs. usage-based vs. a hybrid. Only blocks Phase 5.
- **Verification strictness** — is email-domain matching good enough at launch, or do we
  want a human review step before an employer's first search?
