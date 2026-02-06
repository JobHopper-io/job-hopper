# Recruiting Company Exclusion – Four-Layer Logic (Nick Schepis)

**SOW:** [nick-schepis-job-scraping-automation-sow.md](../../business-documents/nick-schepis-job-scraping-automation-sow.md) – Phase 3. Applies to both Job Hopper DB and BD workflow. Goal: 95–99%+ accuracy excluding recruiting/staffing companies.

---

## Layer 1 – Industry / SIC code exclusion

- **Source:** `company_enrichment` (Apollo) or config `scraping_filter_config.recruiting_sic_codes`.
- **Rule:** Exclude if company’s SIC/industry is in the recruiting list. Default SIC examples: 7361 (Employment agencies), 7363 (Help supply services), 6411 (Insurance agents), 8742 (Management consulting). Config key: `recruiting_sic_codes` (JSON array of strings).
- **When:** Apply when enrichment exists; if no enrichment, skip Layer 1 (do not exclude on “unknown”).

---

## Layer 2 – Company name patterns

- **Source:** Config `scraping_filter_config.recruiting_company_name_patterns` (JSON array of substrings).
- **Rule:** Exclude if `company_name` (case-insensitive) contains any pattern. Default patterns: "Staffing", "Recruiting", "Professionals Worldwide".
- **Apply to:** Every job (no enrichment required).

---

## Layer 3 – Job title vs industry mismatch

- **Source:** Job `title` + `company_enrichment.industry` (or similar).
- **Rule:** Flag/exclude when job title strongly suggests non-recruiting role (e.g. "Machine Operator", "Maintenance Technician") but company industry is recruiting (e.g. "HR Consulting", "Staffing"). Use a small allowlist of “recruiting industry” labels and blocklist of “direct-employer job titles” that must not appear under those industries.
- **Implementation:** If `industry` in recruiting list (e.g. "Staffing", "HR Consulting", "Business Consulting") AND title matches common direct-hire roles (e.g. maintenance, operator, plant manager), treat as mismatch and exclude (recruiting company posting for a role they don’t actually hire for).

---

## Layer 4 – Manual exclusion list

- **Source:** Config or table of known recruiting company names (e.g. `scraping_filter_config.recruiting_company_manual_list` or a dedicated table).
- **Rule:** Exclude if normalized `company_name` is in the list (exact or normalized match).

---

## Order of application

Run layers in order 1 → 2 → 3 → 4. First layer that triggers exclusion wins; log that layer and reason, then skip Job Hopper and BD. If none trigger, log `passed` and include in Job Hopper (and later, if pre-vetting passes, in BD workflow).

---

## Config keys (scraping_filter_config)

| Key | Type | Example |
|-----|------|---------|
| recruiting_sic_codes | JSON array | ["7361", "7363", "6411", "8742"] |
| recruiting_company_name_patterns | JSON array | ["Staffing", "Recruiting", "Professionals Worldwide"] |
| recruiting_industry_labels | JSON array | ["Staffing", "HR Consulting", "Business Consulting"] |
| recruiting_company_manual_list | JSON array | ["Acme Staffing Inc"] |

---

## Logging

For each job evaluated, insert one row into `filter_log`: raw_job_id, company_name, title, layer, excluded (true/false), reason (short text). Use `passed` for jobs that pass all layers.
