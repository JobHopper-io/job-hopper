# Admin Guide – Job Scraping (Nick Schepis)

**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Phase 2 (admin interface for viewing, filtering, search, export, dashboard).

---

## Where the admin lives

- **Supabase Dashboard** (primary): Use the project’s Table Editor and SQL Editor for viewing, filtering, search, and export. No separate app required for MVP.
- **Optional later:** A small CRUD app (e.g. Vue in repo `frontend/` or a separate `job-scraping-admin/`) that uses Supabase client and (if applicable) existing auth can be added; schema and RLS already allow SELECT/INSERT.

---

## Viewing and managing scraped data

1. **Raw jobs:** Table `raw_scraped_jobs`. Filter by `source`, `scraped_at`, or `company_name` in Table Editor filters or SQL.
2. **Processed jobs (Job Hopper):** Table `job_hopper_jobs`. Same filtering; use for quality checks after recruiting-company filter.
3. **BD workflow feed:** Table `bd_workflow_jobs`. Monitor what was sent to n8n; filter by `fed_at`.

---

## Filtering and search

- In Supabase Table Editor: use the filter UI on any column.
- SQL examples:
  - `SELECT * FROM raw_scraped_jobs WHERE source = 'indeed' AND scraped_at > NOW() - INTERVAL '7 days';`
  - `SELECT * FROM job_hopper_jobs WHERE company_name ILIKE '%manufacturing%';`

---

## Data export

- **Table Editor:** Select table → “Export” (CSV).
- **SQL Editor:** Run a query → Export result as CSV.

---

## Dashboard / monitoring

- **Scraper runs:** Table `scraper_run_log`. Columns: source, started_at, finished_at, job_count, error_message. Use for “last run time” and “recent errors.”
- **Row counts:** Run periodically or on demand:
  - `SELECT 'raw_scraped_jobs' AS table_name, COUNT(*) FROM raw_scraped_jobs UNION ALL SELECT 'job_hopper_jobs', COUNT(*) FROM job_hopper_jobs UNION ALL SELECT 'bd_workflow_jobs', COUNT(*) FROM bd_workflow_jobs;`
- **Filter config:** Table `scraping_filter_config`. Edit `value` (JSONB) for company_size_min/max, recruiting_sic_codes, recruiting_company_name_patterns, recruiting_industry_labels, recruiting_company_manual_list. See [recruiting-company-filter-logic.md](./recruiting-company-filter-logic.md).
- **Exclusion report:** View `v_filter_exclusion_report` or query `filter_log`: `SELECT layer, excluded, COUNT(*) FROM filter_log GROUP BY layer, excluded;` to see counts by layer and tune filters (target 95–99%+ accuracy on recruiting exclusion).

---

## How to run it

- **Supabase:** Client opens their Supabase project → Table Editor / SQL Editor. No local run step.
- **Optional app:** If built later, document in this file (e.g. “Run `npm run dev` in `job-scraping-admin/` and open http://localhost:5173”).
