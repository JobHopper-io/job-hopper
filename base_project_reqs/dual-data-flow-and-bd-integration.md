# Dual Data Flow and BD Workflow Integration (Nick Schepis)

**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Phase 4. No modifications to client’s existing BD n8n workflow beyond integration points.

---

## 1. Job Hopper data flow

**Pipeline:** Scraper → normalize to canonical schema → **recruiting-company filter** (four layers) → insert into `job_hopper_jobs` (only jobs that pass).

- **Dedupe:** One row per (company_name, title, url) in `job_hopper_jobs`. Use unique index `idx_job_hopper_jobs_dedup`; on insert use ON CONFLICT DO NOTHING or upsert by (company_name, title, url) to avoid duplicates across sources/runs.
- **Trigger:** After each scrape run (or after filter step in n8n). Write all items that have `_filter_result.excluded === false` to `job_hopper_jobs`. Optionally link `raw_job_id` and `company_enrichment_id` when available.
- **Volume:** Aim for maximum data capture and diversity; no company-size cut at this stage (that applies only to BD flow).

---

## 2. BD workflow feed

**Pipeline:** From the same set that passed the recruiting filter (i.e. rows in `job_hopper_jobs` or equivalent in-memory set), apply **pre-vetting**:

- **Company size:** Include only where `company_enrichment.employee_count` is between `company_size_min` and `company_size_max` (config: 11–200; ideally 11–150).
- **Industry:** Manufacturing preferred; capture all initially and filter later if needed.
- Write qualifying jobs to `bd_workflow_jobs` with: company_name, title, url, location, employee_count, industry, fed_at.

**Integration with client’s n8n (choose one):**

| Option | Description | Contract |
|--------|-------------|----------|
| **A – Shared table** | n8n reads from `bd_workflow_jobs` on a schedule (e.g. Supabase “Get many” node) WHERE `consumed_at` IS NULL. After processing, update row SET `consumed_at` = NOW(). | Table columns: id, company_name, title, url, location, employee_count, industry, fed_at, consumed_at, created_at. |
| **B – Webhook** | Our side calls client’s n8n webhook with a batch of jobs (POST JSON). Client’s workflow processes and responds. | Payload shape below. |
| **C – API** | Client’s n8n calls our API (e.g. GET /bd-feed?since=...) that returns new bd_workflow_jobs. | Response: array of job objects. |

**Payload/response contract (for B or C):**

```json
{
  "jobs": [
    {
      "id": "uuid",
      "company_name": "string",
      "title": "string",
      "url": "string",
      "location": "string",
      "employee_count": 50,
      "industry": "Manufacturing"
    }
  ],
  "fed_at": "ISO8601"
}
```

Document which option the client will use and how they wire n8n (e.g. “Schedule trigger every 6h → Supabase Get rows from bd_workflow_jobs WHERE consumed_at IS NULL → your outreach logic → Supabase Update set consumed_at = NOW()”).

---

## 3. Sync and monitoring

- **Timestamps:** All tables use `created_at` / `fed_at` / `scraped_at`. For “new since last run,” n8n can store last_run in staticData or a small table and filter `WHERE fed_at > last_run`.
- **Monitoring:** Admin dashboard (see [admin-guide-job-scraping.md](./admin-guide-job-scraping.md)): row counts for raw_scraped_jobs, job_hopper_jobs, bd_workflow_jobs; scraper_run_log for last run time and errors. Optional: add a view for “jobs fed to BD in last 24h” for reconciliation.
