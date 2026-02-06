# Job Scraper Research and Recommendation

**Client:** Nick Schepis / Schepmont (Job Scraping Automation & Data Integration)  
**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md)  
**Data sources:** Indeed, Google Jobs, ZipRecruiter (NOT LinkedIn per Dec 1, 2025 decision)

---

## 1. Existing Automation Patterns in Repo

- **n8n workflows:** Stored as JSON and/or markdown summaries under `n8n-workflows/`. Examples: `product-recommendation-workflow.json` (webhook → code → AI → respond), `pitchbook_processor_v4.json` (form → Supabase, Apollo, branching). Workflows use webhooks, Schedule trigger, HTTP Request, Code nodes, and Supabase nodes.
- **No existing job-scraping or job-board workflows** in repo; client’s BD workflow runs in their n8n instance (external). New scraping workflows should be designed for n8n and can be exported as JSON or built in client’s instance from the spec in `job-scraping-workflow-spec.md`.

---

## 2. Scraper Options by Source

### Indeed

| Provider        | Model              | Notes                                                                 |
|----------------|--------------------|-----------------------------------------------------------------------|
| **Apify**      | ~$29/mo + usage    | “Indeed Job Scraper” actor; extracts title, company, salary, location, date, description, link. Well-documented. |
| **ScraperAPI** | Custom/trial       | Indeed scraper solution; proxy rotation, anti-block; pricing on request. |
| **ScrapingBee**| $49–599/mo tiers   | 250k–8M API credits/mo; CAPTCHA bypass, JS rendering; 1k free credits. |
| **HasData**    | 1k free then paid  | No-code; 60+ locales; proxies/CAPTCHA handled.                         |

**Recommendation (Indeed):** Apify for predictable “per run” usage and structured output; alternatively ScrapingBee if client prefers credit-based and may scrape many sources with one account.

### Google Jobs

| Provider        | Model           | Notes                                                                 |
|----------------|--------------------|-----------------------------------------------------------------------|
| **ScraperAPI** | Structured data   | Endpoint `https://api.scraperapi.com/structured/google/jobs`. Params: `API_KEY`, `QUERY`, `COUNTRY_CODE`/`TLD`. Output: JSON/CSV (title, company, location, description, employment type, benefits). ~5k free credits. |
| **WebScrapingAPI** | Google Jobs API | Similar structured Google Jobs offering.                              |

**Recommendation (Google Jobs):** ScraperAPI structured Google Jobs endpoint—single endpoint, structured output, easy to normalize to canonical schema. Client provisions API key and credits.

### ZipRecruiter

| Option           | Model        | Notes                                                                 |
|------------------|-------------|-----------------------------------------------------------------------|
| **ZipRecruiter public API** | Publisher signup | Official API: search by location, distance, job title; post jobs. Requires publisher account. May have limits. |
| **ScrapeIt**     | Custom       | ZipRecruiter scraper: title, company, location, remote, salary, description, dates, apply link, employment type, etc. Delivered CSV/JSON. |
| **Generic scraping (ScraperAPI/ScrapingBee)** | Pay per request | Use generic scraper + custom parser; more work, flexible.              |

**Recommendation (ZipRecruiter):** Try ZipRecruiter public API first (no scraping cost). If insufficient, use ScrapeIt or a generic scraper (ScraperAPI/ScrapingBee) with a parser; document choice and client cost.

---

## 3. Pricing Comparison (Approximate)

| Source       | Option        | Est. cost (SOW reference) | Notes                    |
|-------------|---------------|----------------------------|--------------------------|
| Indeed      | Apify         | ~$29/mo + usage             | Per 1k jobs order of magnitude |
| Indeed      | ScrapingBee   | $49/mo+ (250k credits)      | If multiple sources shared |
| Google Jobs | ScraperAPI    | Credits (~$5/1k jobs cited in SOW) | Structured endpoint      |
| ZipRecruiter| Official API  | Free (publisher TOS)        | Prefer first              |
| ZipRecruiter| ScrapeIt/custom | Custom quote              | If API insufficient       |

**Client responsibility (per SOW Section 4):** All scraper subscription and usage fees. Do not sign up for paid services in development; document what client must provision (API keys, accounts, credits).

---

## 4. Recommendation Summary

1. **Indeed:** Apify “Indeed Job Scraper” (or ScrapingBee if consolidating with Google Jobs on one platform).
2. **Google Jobs:** ScraperAPI structured endpoint `google/jobs` with `QUERY` and `COUNTRY_CODE`/`TLD`.
3. **ZipRecruiter:** ZipRecruiter public API first; if not viable, ScrapeIt or generic ScraperAPI/ScrapingBee + parser.

**Next steps for client:** (1) Create accounts (Apify and/or ScraperAPI/ScrapingBee, ZipRecruiter publisher if using API). (2) Obtain API keys and add to env (no keys in repo). (3) Confirm rate limits and quotas for expected volume (e.g. 10k+ jobs in minutes per SOW).

---

## 5. Rate Limits and Output Schema

- Document each provider’s rate limits in the workflow spec and admin runbook.
- All scrapers must output to the **canonical raw job schema** defined in `job-scraping-schema.md` so downstream (Supabase, filtering, dual flow) stays source-agnostic.
