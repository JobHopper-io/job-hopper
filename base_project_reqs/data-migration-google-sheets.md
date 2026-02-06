# Data Migration from Google Sheets (Nick Schepis)

**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Phase 2 (Data Migration). Client may have existing job data in Google Sheets from the prior VA workflow.

---

## Approach

- **Do not assume live Google API access** unless the client provides credentials and confirms Sheet ID and range.
- Preferred: client exports Sheets to CSV; then one-off import into `raw_scraped_jobs` or `job_hopper_jobs` using the [canonical schema](./job-scraping-schema.md).

---

## Steps (one-off)

1. **Export:** Client exports the relevant sheet(s) to CSV (one file per sheet or one combined file).
2. **Map columns** to canonical fields: title, company_name, location, url, posted_at, source (e.g. `indeed` if all from one source), scraped_at (use file date or a fixed timestamp), external_id, description, salary, employment_type.
3. **Import options:**
   - **Option A – n8n:** Workflow: Read CSV from file or Google Drive → Code node to map to schema → Supabase “Insert” node into `raw_scraped_jobs`. Run once.
   - **Option B – Script:** Node/Python script that reads CSV, maps rows to canonical shape, and uses Supabase client to batch insert into `raw_scraped_jobs`.
   - **Option C – Supabase Dashboard:** Use Table Editor “Import data from CSV” after adding a CSV that matches column names (id can be auto-generated).
4. **Validate:** After import, run `SELECT COUNT(*), source FROM raw_scraped_jobs GROUP BY source` and spot-check a few rows. Preserve historical data by not truncating before import if there is existing data in the table.

---

## Out of scope

- Data cleanup beyond mapping to schema (e.g. de-duplication across sheets) is optional; document if done.
- Migration from sources other than the client’s existing Google Sheets is out of scope (SOW Section 4).
