# Job Scraping & Job Hopper – Architecture and Data Flow (Nick Schepis)

**SOWs:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md), [nick-schepis-job-matching-mvp-app-sow.md](../../business-documents/nick-schepis-job-matching-mvp-app-sow.md).

---

## High-level

```
[Indeed] [Google Jobs] [ZipRecruiter]
       \       |       /
        \      v      /
     Normalize to canonical schema
              |
              v
       raw_scraped_jobs
              |
    +---------+---------+
    |                   |
    v                   v
Apollo enrich    Recruiting filter
(company_enrichment)  (4 layers)
    |                   |
    +---------+---------+
              |
              v
    job_hopper_jobs (deduped)
              |
    +---------+------------------+
    |                            |
    v                            v
BD pre-vet                    Job Hopper
(company 11–200)              (matching +
    |                          notifications)
    v                           
bd_workflow_jobs             job_hopper_subscribers
    |                          + preferences
    v                           
Client n8n (existing)
```

---

## Tables (Supabase)

- **raw_scraped_jobs** – All scraped jobs (canonical schema).
- **company_enrichment** – Apollo: company_name, employee_count, industry, sic_code.
- **job_hopper_jobs** – After recruiting filter; deduped; feeds Job Hopper and BD.
- **bd_workflow_jobs** – Pre-vetted subset (11–200 employees); consumed by client n8n.
- **filter_log** – Per-job filter decision (layer, excluded) for reporting.
- **scraping_filter_config** – Configurable thresholds and lists.
- **scraper_run_log** – Run metadata (source, job_count, error).
- **job_hopper_subscribers** – Subscribers; first_batch_sent_at for 24h rule.
- **job_hopper_subscriber_preferences** – Roles, pay range, location, relocation.

---

## Key docs in this folder

- [scraper-research-and-recommendation.md](./scraper-research-and-recommendation.md)
- [job-scraping-schema.md](./job-scraping-schema.md)
- [supabase-schema-job-scraping.md](./supabase-schema-job-scraping.md)
- [recruiting-company-filter-logic.md](./recruiting-company-filter-logic.md)
- [dual-data-flow-and-bd-integration.md](./dual-data-flow-and-bd-integration.md)
- [new-subscriber-24h-first-batch.md](./new-subscriber-24h-first-batch.md)
- [admin-guide-job-scraping.md](./admin-guide-job-scraping.md)
- [troubleshooting-job-scraping.md](./troubleshooting-job-scraping.md)
- [cost-summary-job-scraping.md](./cost-summary-job-scraping.md)
- [pwa-install-and-web-push.md](./pwa-install-and-web-push.md)
