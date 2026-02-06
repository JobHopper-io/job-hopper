# Job Scraping – Troubleshooting Guide (Nick Schepis)

**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Phase 6.

---

## Scraper / API failures

- **Symptom:** No new rows in `raw_scraped_jobs` or run fails.
- **Check:** `scraper_run_log` for error_message; n8n execution logs for HTTP status (429, 403, 500).
- **Actions:** Verify API keys (ScraperAPI, Apify, ZipRecruiter) in env; respect rate limits (add delay or reduce batch size); retry with backoff.

---

## Recruiting filter too strict or too loose

- **Symptom:** Too many direct employers excluded, or recruiting companies getting through.
- **Check:** Query `filter_log` and `v_filter_exclusion_report`; compare excluded vs passed by layer.
- **Actions:** Tune `scraping_filter_config`: recruiting_sic_codes, recruiting_company_name_patterns, recruiting_industry_labels, recruiting_company_manual_list. Re-run filter on a sample and inspect reasons.

---

## Apollo enrichment missing or wrong

- **Symptom:** Many jobs with no company_enrichment_id; BD flow empty or too small.
- **Check:** Count rows in `company_enrichment` vs distinct company_name in raw; check Apollo API response and rate limits.
- **Actions:** Ensure Apollo key and credits; normalize company name (trim, lowercase) before lookup; cache results in company_enrichment to avoid duplicate calls.

---

## BD workflow not receiving jobs

- **Symptom:** n8n reports no new rows or webhook not called.
- **Check:** Rows in `bd_workflow_jobs` with consumed_at IS NULL; company_size filter (11–200) may exclude most if enrichment is missing.
- **Actions:** Confirm integration option (shared table vs webhook vs API); if table, verify n8n Supabase node filters and credentials; if webhook, verify URL and payload shape.

---

## First batch not sent within 24h

- **Symptom:** Subscriber has first_batch_sent_at NULL after 24h.
- **Check:** Schedule for “new subscriber” process (e.g. every 6h); query subscribers WHERE first_batch_sent_at IS NULL AND created_at > NOW() - INTERVAL '24 hours'.
- **Actions:** Run matching and send manually for one subscriber to test; ensure email/notification step runs and updates first_batch_sent_at.

---

## How to re-run

- **Single scraper run:** Trigger n8n workflow manually; confirm output to raw_scraped_jobs.
- **Filter only:** Re-feed raw_scraped_jobs (or last run output) through recruiting filter and dual flow; clear or skip existing job_hopper_jobs/bd_workflow_jobs if re-backfill intended.
- **First batch only:** Set first_batch_sent_at = NULL for one subscriber and run the 24h process again.
