# Apollo Integration for Job Scraping (Nick Schepis)

**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Phase 3. Apollo usage fees are client responsibility (Section 4).

---

## Purpose

- Enrich job/company with **company size** (employee_count) and **industry/SIC** for:
  - **Layer 1 recruiting exclusion:** SIC/industry used to exclude staffing/consulting.
  - **BD workflow filter:** Only send jobs with company size 11–200 (ideally 11–150) to the client’s n8n BD workflow.

---

## Data flow

1. After raw jobs are in `raw_scraped_jobs`, for each distinct `company_name` (or after dedupe), call Apollo API (company search or enrichment).
2. Store result in `company_enrichment`: company_name, company_domain, employee_count, industry, sic_code, raw_response, enriched_at.
3. Use unique on normalized company_name (migration already has idx_company_enrichment_company_name). Upsert: if company exists, update employee_count/industry/sic_code and enriched_at.
4. When applying recruiting filter and BD filter, join job to company_enrichment by company_name (normalized) to get employee_count and industry/SIC.

---

## API usage (client provisions)

- **Credentials:** Apollo API key (env e.g. `APOLLO_API_KEY`). Client signs up and pays for credits.
- **Endpoint:** Apollo company search or enrichment API (see Apollo docs). Typical: search by company name or domain; response includes employee count, industry.
- **Rate limits:** Respect Apollo rate limits; add delay or batch to avoid 429. Cache results in `company_enrichment` so the same company is not re-enriched every run.
- **Fallback:** If Apollo returns no result, leave company_enrichment_id null; Layer 1 is skipped for that job (do not exclude on “unknown”). BD filter will exclude if employee_count is null or out of range.

---

## Implementation options

- **n8n:** HTTP Request node to Apollo → Code node to map to company_enrichment shape → Supabase “Upsert” into company_enrichment (on LOWER(TRIM(company_name)) or a unique key).
- **Script:** Node/TS script that reads unenriched companies from raw_scraped_jobs, calls Apollo, writes company_enrichment. Run on schedule or after each scrape.

---

## Config

- Company size bounds are in `scraping_filter_config`: company_size_min (11), company_size_max (200), company_size_ideal_max (150). Use these when writing to `bd_workflow_jobs` (Stage 4).
