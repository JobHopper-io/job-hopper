# New Subscriber 24-Hour First Batch (Nick Schepis)

**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Phase 5. New subscribers must receive matched jobs within 24 hours.

---

## 1. Subscriber and matching contract

**Shared Supabase tables (same project as scraping):**

- **job_hopper_subscribers:** id, email, created_at, first_batch_sent_at, stripe_customer_id, stripe_subscription_id, tier.
- **job_hopper_subscriber_preferences:** subscriber_id (FK), roles (array), pay_range_min, pay_range_max, location, relocation_willing, background_role, resume_url.

Both the **scraping/notification pipeline** (this stage) and the **Job Hopper backend** (Stage 8) read/write these tables. No separate API required for “new subscriber” discovery.

---

## 2. Priority queue for new subscribers

**Process (run on schedule, e.g. every 6 hours):**

1. **List subscribers needing first batch:**  
   `SELECT s.*, p.roles, p.pay_range_min, p.pay_range_max, p.location, p.relocation_willing FROM job_hopper_subscribers s LEFT JOIN job_hopper_subscriber_preferences p ON p.subscriber_id = s.id WHERE s.first_batch_sent_at IS NULL AND s.created_at > NOW() - INTERVAL '24 hours'.`

2. **For each subscriber,** run matching against current `job_hopper_jobs` using [matching rules](#3-matching-rules) below. Limit to a reasonable first batch (e.g. 10–20 jobs).

3. **Send first batch:** Email (and optionally push when Job Hopper app is live). Record send: `UPDATE job_hopper_subscribers SET first_batch_sent_at = NOW() WHERE id = ?`.

4. **Schedule:** Cron or n8n Schedule trigger every 6h so that any subscriber created in the last 24h gets a run within 24h.

---

## 3. Matching rules

Same logic as Job Hopper backend (Stage 8); keep in sync.

- **Not too tight, not too loose:** Prefer moderate overlap so subscribers see enough opportunities without irrelevant jobs.
- **Role:** Prefer jobs whose `title` or `description` overlaps with subscriber `roles` (e.g. “Maintenance Technician” matches roles ["Maintenance", "Technician"]). Use simple keyword overlap or scoring.
- **Pay range:** If job has salary and subscriber has pay_range_min/max, filter or rank by overlap.
- **Location:** If subscriber has location, prefer jobs in same region or “Remote”. If `relocation_willing` is true, include other locations; if false, filter to same metro/state or remote.
- **Volume:** Return at least a few jobs (e.g. 5–20) when available; avoid empty first email.

Document the exact scoring or filter thresholds in one place (e.g. “matching-rules.md” or in backend code) so both this pipeline and the Job Hopper API use the same logic.

---

## 4. Email and push

- **Email:** Transactional email provider; template with job list, briefings (if available), and apply links. Include unsubscribe and preference-update link.
- **Push:** When Job Hopper PWA supports web push, store push subscription and send for new matches; first batch can be email-only, then web push for subsequent matches.
