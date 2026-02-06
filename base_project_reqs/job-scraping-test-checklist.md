# Job Scraping – Test Checklist and Sample Payloads (Nick Schepis)

**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Phase 6.

---

## 1. Scraper output → DB

- [ ] Run one scraper (e.g. Google Jobs workflow) with test API key; confirm response shape.
- [ ] Normalize node outputs items matching [job-scraping-schema.md](./job-scraping-schema.md).
- [ ] Insert into `raw_scraped_jobs`; verify row count and spot-check columns (title, company_name, source, scraped_at).

**Sample raw item (after normalize):**

```json
{
  "title": "Maintenance Technician",
  "company_name": "ABC Manufacturing",
  "location": "Dallas, TX",
  "url": "https://example.com/job/1",
  "source": "google_jobs",
  "scraped_at": "2025-12-06T12:00:00Z",
  "external_id": "abc123"
}
```

---

## 2. Recruiting filter (four layers)

- [ ] Load config from `scraping_filter_config` (or inject test config).
- [ ] Run [recruiting-filter-code-node.js](./recruiting-filter-code-node.js) on a mix: direct employer, staffing company name, SIC in exclusion list. Confirm excluded/passed and layer logged.
- [ ] Verify `filter_log` rows for each decision (if pipeline writes to it).

**Sample job that should be excluded (Layer 2):** company_name "Acme Staffing Services".

**Sample job that should pass:** company_name "ABC Manufacturing", no enrichment or enrichment with non-recruiting industry.

---

## 3. Apollo enrichment

- [ ] Call Apollo (or mock) for one company; write to `company_enrichment`. Verify employee_count and industry/SIC.
- [ ] Confirm Layer 1 uses enrichment when present; no false exclude when enrichment missing.

---

## 4. Dual flow (Job Hopper + BD)

- [ ] After filter, insert passing jobs into `job_hopper_jobs`; check dedupe (same job twice → one row).
- [ ] Apply company size filter (11–200); insert into `bd_workflow_jobs`. Verify only jobs with employee_count in range (or null handled per product decision).
- [ ] If using Option A: n8n reads `bd_workflow_jobs` WHERE consumed_at IS NULL and updates consumed_at.

---

## 5. New subscriber first batch

- [ ] Insert test subscriber with `first_batch_sent_at` NULL and preferences.
- [ ] Run matching against current `job_hopper_jobs`; send or log first batch.
- [ ] Update `first_batch_sent_at`; confirm next run skips that subscriber.

---

## 6. Performance

- [ ] Batch insert raw jobs (e.g. 100+ rows) in one run; measure time.
- [ ] Apollo: cache by company_name; avoid re-calling same company every run.
- [ ] Document scraper cost per 1k jobs and VA cost comparison in [cost-summary-job-scraping.md](./cost-summary-job-scraping.md).
