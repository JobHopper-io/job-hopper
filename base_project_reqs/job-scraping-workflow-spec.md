# Job Scraping Workflow Spec (n8n)

**Purpose:** Design for automated scraping workflows for Indeed, Google Jobs, and ZipRecruiter. Can be implemented as JSON in repo or built in client’s n8n instance from this spec.

**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Phase 1 (scheduling, error handling, logging, normalize to common schema).

**Canonical schema:** [job-scraping-schema.md](./job-scraping-schema.md).

---

## 1. Per-Source Workflow Shape (Indeed, Google Jobs, ZipRecruiter)

Each source has its own workflow (or one workflow with a router by source). High-level nodes:

1. **Trigger – Schedule**  
   - Run on a schedule (e.g. daily or every 6–12 hours). SOW target: support 10k+ jobs in minutes; tune batch size and concurrency to provider limits.

2. **Fetch jobs**  
   - **Indeed:** Apify “Indeed Job Scraper” node or HTTP Request to Apify API; pass search params (query, location, etc.) from config or static.  
   - **Google Jobs:** HTTP Request to ScraperAPI structured endpoint `GET/POST https://api.scraperapi.com/structured/google/jobs` with `API_KEY`, `QUERY`, `COUNTRY_CODE`.  
   - **ZipRecruiter:** HTTP Request to ZipRecruiter API or third-party scraper; pass search params.

3. **Normalize to canonical schema**  
   - **Code** node: map provider response to the fields in [job-scraping-schema.md](./job-scraping-schema.md). Set `source` = `indeed` | `google_jobs` | `ziprecruiter`, `scraped_at` = now (ISO). Output array of items (one per job).

4. **Error handling and retries**  
   - On HTTP/API errors: retry with backoff (e.g. 2–3 retries, exponential backoff).  
   - On partial failure: log failed items, continue with successful items.  
   - Use n8n “Error Trigger” or catch errors in a subflow and send to a “Log failure” node (e.g. write to a table `scraper_run_log` or send one summary email per run).

5. **Logging and monitoring**  
   - After normalize: log count of items produced, source, and timestamp (e.g. to Supabase `scraper_run_log` or a simple log node).  
   - Optional: if Supabase is available in this stage, write run metadata (source, started_at, finished_at, job_count, error_message) for dashboard.

6. **Output**  
   - Output of the workflow = array of items in canonical schema. This output is consumed by the next stage (Stage 2: write to Supabase `raw_scraped_jobs`). Until DB is ready, can write to a file or another workflow for testing.

---

## 2. Scheduling and Concurrency

- **Schedule:** One run per source per interval (e.g. 3 workflows × 1 run each every 12 hours), or one workflow that loops over sources. Avoid overlapping runs for the same source to respect rate limits.
- **Batch size:** If provider returns paginated results, loop over pages in the same run; batch size and page size per provider docs.
- **Rate limits:** In Code or HTTP node, respect provider rate limits (e.g. delay between requests if needed). Document in admin runbook.

---

## 3. Implementation Notes for Agent

- **If workflows live in repo:** Add one JSON file per source (e.g. `n8n-workflows/job-scraping-indeed.json`) or one combined `job-scraping-all-sources.json` with a router. Use same node patterns as existing repo workflows (Schedule, HTTP Request, Code, optional Supabase for run_log).
- **If client builds in their n8n:** This spec is the step-by-step; no JSON required. Provide “Environment and credentials” doc listing required env vars (e.g. `SCRAPER_API_KEY`, `APIFY_TOKEN`, ZipRecruiter API key).
- **Downstream:** Stage 2 will add “Insert into Supabase raw_scraped_jobs” node(s) or a separate workflow that receives this output (webhook or scheduled “read last run and insert”).

---

## 4. Done When (Stage 1)

- Scraper recommendation doc exists: [scraper-research-and-recommendation.md](./scraper-research-and-recommendation.md).  
- Canonical job schema is written: [job-scraping-schema.md](./job-scraping-schema.md).  
- This workflow spec exists with trigger, fetch, normalize, error handling, and logging.  
- Optional: workflow JSON in `n8n-workflows/` for at least one source (e.g. Google Jobs) as a template.
