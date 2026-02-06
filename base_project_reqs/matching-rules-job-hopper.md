# Job Hopper Matching Rules (Not Too Tight / Not Too Loose)

**Source:** SOW and [nicholas--tanner-nov-19-2025.md](../meeting-notes/nicholas-schepis/nicholas--tanner-nov-19-2025.md). Used by: (1) New subscriber 24h first batch (Stage 5), (2) Job Hopper backend matching (Stage 8).

---

## Principles

- **Not too tight:** Don’t over-filter; avoid missing good opportunities.
- **Not too loose:** Don’t send plant manager jobs to maintenance techs (or vice versa).

---

## Inputs

**From subscriber preferences:** roles (array), pay_range_min, pay_range_max, location, relocation_willing.  
**From job:** title, company_name, location, salary, description (job_hopper_jobs).

---

## Rules (implement the same in both pipelines)

1. **Role overlap:** Prefer jobs where `job.title` (and optionally description) contains or overlaps subscriber `roles`. Use case-insensitive keyword match or simple scoring (e.g. 1 point per role keyword match). Include jobs with score > 0; rank by score.
2. **Pay range:** If both job salary (parsed to number or range) and subscriber pay_range_min/max exist, include only jobs that overlap the range (or within a tolerance). If salary is missing, don’t exclude.
3. **Location:** If subscriber has location: include “Remote” jobs; include same metro/state; if relocation_willing, include other locations (optionally with lower rank). If no location preference, include all.
4. **Volume:** Cap results per run (e.g. 20–50 jobs per subscriber). For first batch, use a smaller cap (e.g. 10–20).
5. **Recency:** Prefer recent jobs (posted_at) when ranking.

---

## Implementation note

Use one shared function or module (e.g. `matchJobs(subscriber, jobs) -> ranked jobs`) in the backend and in the 24h-first-batch workflow so behavior stays identical.
