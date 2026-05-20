# Job Hopper Matching Rules (Not Too Tight / Not Too Loose)

**Source:** SOW and [nicholas--tanner-nov-19-2025.md](../meeting-notes/nicholas-schepis/nicholas--tanner-nov-19-2025.md).

---

## Principles

- **Not too tight:** Don’t over-filter; avoid missing good opportunities.
- **Not too loose:** Don’t send plant manager jobs to maintenance techs (or vice versa).

---

## Inputs

**From subscriber preferences:** roles (array), `target_job_title` (else `current_job_title`) for phrase extraction, `current_industry`, pay_range_min, pay_range_max, location, relocation_willing, remote preference, radius.  
**From job:** title, company_name, location, salary (derived from `pay_min`/`pay_max`/`pay_type` when present), description, AI briefing (`job_hopper_live`).

---

## Rules (implement the same in both pipelines)

1. **Phrase / role score:** Build primary and (when applicable) secondary n-grams from comma-separated target/current title and from industry text. Single-token “stop” words (merged list: senior, engineer, manager, etc.) never count as a primary phrase alone. Match phrases with **word boundaries** on three surfaces: job **title**, **description**, and **AI briefing**. Each surface has configurable weights for **primary**, **secondary**, and **industry** tiers; contribution is weight × phrase word count (when enabled in code). **Phrase gate:** if the subscriber has **no** title-derived phrases and **no** industry text, no phrase penalty applies. Otherwise the job passes the gate iff the sum of **primary-tier + industry-tier** surface scores is **> 0** (title-derived **secondary** tier contributes to the overall phrase score for ranking but **never** satisfies the gate alone). If the gate fails, `no_keyword_match_penalty` applies. Jobs are ranked by total score (phrase + pay + location + recency) and excluded when total is below `min_total_score` or phrase role score is at or below half the magnitude of `no_keyword_match_penalty` after gating.
2. **Pay range:** If both job salary (parsed to number or range) and subscriber pay_range_min/max exist, include only jobs that overlap the range (or within a tolerance). If salary is missing, don’t exclude.
3. **Location:** If subscriber has location: include “Remote” jobs; include same metro/state; if relocation_willing, include other locations (optionally with lower rank). If no location preference, include all.
4. **Recency:** Prefer recent jobs (posted_at) when ranking; jobs older than `max_age_days` are excluded.

---

## Implementation note

Use one shared function (`matchJobs(subscriber, jobs) -> ranked jobs`) in the backend (`supabase/functions/_shared/job-matching-algorithm.ts`) with phrase logic in `phrase-matching.ts` so behavior stays identical across `match-jobs`, scheduled matching, and admin tests.
