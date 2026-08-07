# Recruiter-Visible Mode — Status Report

As of 2026-08-07. Covers the employer/recruiter-facing side of Job Hopper (branch `recruiter-side`) against the approved 6-phase build plan (`docs/recruiter-visible-mode-build-plan.md`).

## Summary

Phases 1–4 of the roadmap are complete — the employer-facing product works end-to-end today: sign up → get verified → search candidates → request an introduction → seeker approves → employer receives contact info → employer drafts outreach. Phases 5 (billing) and 6 (admin/trust/launch) have not been started.

## Recently shipped (pricing/onboarding, tracked separately)

| Item | Status | Date |
|---|---|---|
| "Premium Insights" renamed to "Hiring Intel" | ✅ Done | 2026-07-31 |
| Post-signup feature walkthrough on login | ✅ Done | 2026-07-31 |
| "First 25 Core signups get a free month" promo | ✅ Done | 2026-07-31 |
| Standard trial extended from 7 days to 2 weeks (Core & Premium) | ✅ Done | 2026-07-31 |

## Recruiter-Visible Mode: phase-by-phase

### Phase 1 — Seeker-side groundwork ✅ Done
- `recruiter_visible` opt-in toggle on the seeker profile, off by default.
- Seekers record their current employer, so that company can be excluded from ever seeing them in search — this is the mechanism the whole feature's trust promise rests on.
- Surfaced directly in onboarding Step 1, not just buried in account settings.

### Phase 2 — Employer accounts & verification ✅ Done
- Dedicated employer sign-up (company name, work email) — a distinct account type from seeker profiles, not a role flag on the same table.
- Verification: work-email domain matched against known employers auto-verifies; free-email domains (gmail, etc.) start `pending`. Apollo org-search then acts as the authoritative signal (does the claimed company's real domain match the work email's domain?), with the signup-time heuristic as fallback when Apollo is inconclusive.
- Separate employer login, visually distinct from the seeker app, own dashboard entry point.

### Phase 3 — Candidate search ✅ Done
- Employers filter by role category, career level, and location.
- Every result is anonymized — job title, career level, years of experience, target roles, preferred locations. Never a name, resume, or contact info at this stage.
- Server-side exclusion: any candidate whose listed current employer matches the searching company never appears, regardless of who at that company is searching.

### Phase 4 — Reveal & approval flow ✅ Done
- Employers send a reveal request that must name the actual role and pay range on offer — seekers never approve blind.
- Seeker is notified by email and must explicitly approve or decline. Declines are silent; the employer isn't told why.
- On approval, the employer receives name, email, and phone. On decline or no action, nothing changes.
- Employers can cancel a still-pending request. Re-requesting the same candidate is blocked while a request is pending or already approved, but re-opens after a cancel or decline.
- Seekers manage incoming requests from a dedicated "Reveal Requests" inbox.

### Beyond the original plan — Outreach draft assist (2026-08-06/07)
Not in the original roadmap; added as a follow-on once Phase 4 was live.
- Once a reveal request is approved, the employer can generate an LLM-drafted first-contact email (subject + body), grounded in the role, pay range, and the candidate's now-visible background.
- Cached after first generation — regenerating isn't needed on repeat visits.
- "Open in email" (pre-filled `mailto:`) and "Copy" actions.

### Phase 5 — Billing & access tiers ❌ Not started
- No employer-side subscription or paywall exists. Search and reveal-request access is currently free for any verified employer.
- Open decision from the build plan is still unresolved: flat monthly fee vs. usage-based vs. hybrid.

### Phase 6 — Admin, trust & launch ❌ Not started
- No admin UI to review, approve, reject, or suspend employer accounts — verification today is fully automatic (domain match or Apollo signal only), with no human review step for edge cases.
- No audit trail surfaced to seekers proving their own employer was actually excluded from a search, beyond trusting the mechanism.
- No rate limits on search volume or reveal-request volume per employer — nothing currently stops mass-searching or reveal-request spam.
- Public FAQ / privacy language hasn't been updated to describe this feature yet.
- No decision made on soft-launching to a small hand-picked group of employers vs. opening signup broadly.

## Bottom line

The product works for a real employer today, but isn't ready for a public or broad launch: there's no revenue mechanism (Phase 5) and no abuse/trust guardrails (Phase 6) — most notably, employer accounts verify themselves automatically with no human able to intervene, and nothing rate-limits search or reveal-request volume.
