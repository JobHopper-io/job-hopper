# Job Scraping – Supabase Schema (Nick Schepis)

**Migration:** `supabase/migrations/20260206210927_nick_schepis_job_scraping_schema.sql`  
**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Phase 2

---

## Tables and Relationships

```
raw_scraped_jobs (1) ──► (0..1) job_hopper_jobs.raw_job_id
company_enrichment (1) ──► (0..n) job_hopper_jobs.company_enrichment_id
job_hopper_jobs (1) ──► (0..1) bd_workflow_jobs.job_hopper_job_id
```

- **raw_scraped_jobs** – All jobs from scrapers (Indeed, Google Jobs, ZipRecruiter). Canonical schema; dedupe by (source, external_id).
- **company_enrichment** – Apollo (or other) enrichment: company_name, company_domain, employee_count, industry, sic_code. One row per company (unique on normalized company_name).
- **job_hopper_jobs** – Processed jobs after recruiting-company exclusion; feeds Job Hopper. Dedupe by (company_name, title, url). Optional FK to raw_scraped_jobs and company_enrichment.
- **bd_workflow_jobs** – Subset for BD workflow (company size 11–200, pre-vetted). n8n reads from here or from an API that queries this table.
- **scraping_filter_config** – Key/value (JSONB) for company_size_min/max, recruiting_sic_codes, recruiting_company_name_patterns.
- **scraper_run_log** – Per-run metadata: source, started_at, finished_at, job_count, error_message (for dashboard/monitoring).

---

## Indexes

- `raw_scraped_jobs`: (source, external_id) unique; scraped_at, source.
- `company_enrichment`: unique on LOWER(TRIM(company_name)); employee_count.
- `job_hopper_jobs`: unique (company_name, title, url) for dedupe; created_at.
- `bd_workflow_jobs`: fed_at.
- `scraper_run_log`: (source, started_at).

---

## RLS

All tables have RLS enabled. Policies allow SELECT and INSERT (and UPDATE where noted) for flexibility with service role (n8n) and authenticated admin. Restrict further in production if needed.
