# Canonical Raw Job Schema (Job Scraping)

**Purpose:** Single contract for all scrapers (Indeed, Google Jobs, ZipRecruiter). Downstream Supabase tables and filtering use this shape; per-source fields are normalized in the scraping workflow before insert.

**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Phase 1 (normalize to common schema), Phase 2 (raw scraped jobs table).

---

## Required Fields (all sources must map to these)

| Field         | Type     | Required | Description |
|---------------|----------|----------|-------------|
| `title`       | string   | Yes      | Job title. |
| `company_name`| string   | Yes      | Employer display name (company name only; used later for recruiting-company filter). |
| `location`    | string   | No       | Location text (e.g. "Austin, TX" or "Remote"). |
| `url`         | string   | Yes      | Canonical apply or job page URL (used for dedupe). |
| `posted_at`   | string or timestamp | No | Post date (ISO 8601 preferred). |
| `source`      | string   | Yes      | One of: `indeed`, `google_jobs`, `ziprecruiter`. |
| `scraped_at`  | string (ISO 8601) | Yes | When this row was scraped. |
| `external_id` | string   | No       | Source-specific job id for dedupe. |
| `description`  | string   | No       | Full or truncated job description. |
| `salary`      | string   | No       | Raw salary text if available. |
| `employment_type` | string | No    | e.g. Full-time, Part-time, Contract. |

---

## Optional / Enriched Later

- `company_domain` – filled by Apollo or parsing.
- `industry` / `sic_code` – filled by Apollo; used for recruiting-company exclusion (Layer 1).
- `employee_count` – filled by Apollo; used for BD filter (11–200).

These are not required from scrapers; add in processing/enrichment steps before writing to **processed** or **filtered** tables.

---

## Deduplication

- **Raw table:** Dedupe by `(source, external_id)` or, if no external_id, by `(source, company_name, title, url)` (or hash of url). One row per unique job per scrape run; `scraped_at` distinguishes runs.
- **Processed Job Hopper table:** Dedupe by `(company_name, title, url)` or content hash so the same job from two sources is stored once.

---

## Example (normalized payload for one job)

```json
{
  "title": "Maintenance Technician",
  "company_name": "ABC Manufacturing Inc",
  "location": "Dallas, TX",
  "url": "https://www.indeed.com/viewjob?jk=abc123",
  "posted_at": "2025-12-01T00:00:00Z",
  "source": "indeed",
  "scraped_at": "2025-12-06T12:00:00Z",
  "external_id": "abc123",
  "description": "We are looking for...",
  "salary": "$25 - $32/hr",
  "employment_type": "Full-time"
}
```

---

## Usage

- **Stage 1 (scraping):** Each n8n scraper node or sub-workflow outputs items in this shape (or a Code node normalizes provider output to this shape).
- **Stage 2 (Supabase):** Table `raw_scraped_jobs` (or equivalent) columns match these fields plus `id` (uuid), `created_at`. Same schema doc can be used for migration column list.
