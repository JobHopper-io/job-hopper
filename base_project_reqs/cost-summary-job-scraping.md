# Job Scraping – Cost Summary (Nick Schepis)

**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Section 3 deliverable 6, Section 7 (Cost Savings Analysis).

---

## Current VA cost (replaced)

- **Before:** $1,600/month (single VA for job data entry).
- **Eliminated** by full automation per SOW.

---

## Scraping costs (client responsibility)

- **Indeed:** Apify or similar; order of magnitude ~$29/mo + usage or ~$5 per 1,000 jobs (SOW reference).
- **Google Jobs:** ScraperAPI credits; ~$5 per 1,000 jobs (SOW reference).
- **ZipRecruiter:** Public API (free) or third-party scraper (variable).
- **Total estimate:** At 10k jobs/week, roughly $50–200/month depending on providers and volume; document actual usage in `scraper_run_log` and provider dashboards.

---

## Apollo

- Client pays API credits. Usage depends on distinct companies enriched per run; cache in `company_enrichment` to minimize repeat calls.

---

## ROI

- **Monthly savings:** ~$1,600 (VA) − scraping and Apollo costs ≈ **~$1,400+** (order of magnitude).
- **Project cost recovery:** SOW Section 7: project fee TBD; recovery timeline depends on final fee and savings above.

---

## Documentation

- Record scraper costs and usage in admin runbook or `scraper_run_log` metadata so client can track vs VA baseline.
