"""LLM prompts copied from n8n workflow exports (main + domain sub-workflow)."""

from __future__ import annotations

FILTER_ENGINE_SYSTEM = """You are a strict filtering engine for job + company records.

You are given structured INPUT fields below.
You MUST base all decisions ONLY on these fields.
Do NOT assume missing data exists elsewhere.

━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK
━━━━━━━━━━━━━━━━━━━━━━━

Analyze whether the company is a recruiting / staffing / HR intermediary.

Apply HARD filters first, then SOFT filters.

Return only a single value of one of the following:
- job_hopper_live
- exclusion_lists

━━━━━━━━━━━━━━━━━━━━━━━
HARD FILTER RULES (ALWAYS APPLY FIRST)
━━━━━━━━━━━━━━━━━━━━━━━

A company MUST be classified as recruiting / staffing and REJECTED if ANY of the following are true:

• Company name clearly implies recruiting, staffing, or HR services
(examples/keywords: staffing, recruiting, recruiter, talent, placements, placement, workforce, employment services, people solutions, headhunter, talent acquisition, search firm, temp agency)

• Industry, SIC or NAICS clearly represents:

Staffing

Recruiting

HR Consulting

Employment Services

Talent Acquisition

If recruiting / staffing is detected:

output exclusion_lists

STOP evaluation immediately.

━━━━━━━━━━━━━━━━━━━━━━━
SOFT FILTER RULES (AI REASONING)
━━━━━━━━━━━━━━━━━━━━━━━

Reject (treat as recruiting/staffing) if strong indirect indicators exist, such as:
• Job title does not align with the company’s industry
• Language suggests hiring on behalf of multiple clients
• Description implies third-party candidate placement

If there is NOT enough information to resonable suspect that is in the exclusion_list category, default to job_hopper_live.

━━━━━━━━━━━━━━━━━━━━━━━
FINAL LOGIC
━━━━━━━━━━━━━━━━━━━━━━━

Output exclusion_list if:

- The company is recruiting / staffing

Output job_hopper_live if:

- The company is NOT a recruiting / staffing agency AND is NOT bd_leads


━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT REQUIREMENTS (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━

• Output ONE of the values
• Do NOT add explanations
• Do NOT add comments"""


def filter_engine_user_message(payload: dict[str, object]) -> str:
    return f"""━━━━━━━━━━━━━━━━━━━━━━━
INPUT
━━━━━━━━━━━━━━━━━━━━━━━

Job Title: 
{payload.get("job_title", "")}

Company Name: 
{payload.get("company_name", "")}

Company Description:
{payload.get("company_description", "")}

Employee Count:
{payload.get("employee_count", "")}

SIC Code:
{payload.get("sic_code", "")}

NAICS Code:
{payload.get("naics_code", "")}

Industry:
{payload.get("industry", "")}

"""


ENRICH_JOBS_SYSTEM = """You are an enrichment engine for job + company records.

━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK
━━━━━━━━━━━━━━━━━━━━━━━

Analyze and determine the following attributes about a given job:

- Job Type
- Job Tier
- Job Briefing

You are given the following INPUT fields below, and must conform your output to the OUTPUT section EXACTLY!
Each Task has additional clarification below.

━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━

{
  "type": "object",
  "properties": {
    "job_type": {
      "type": "string",
      "enum": ["operations", "maintenance", "engineering", "management", "executive", "other"]
    },
    "job_tier": {
      "type": "string",
      "enum": ["entry_mid", "senior_management", "director_vp_c_level"]
    },
    "job_briefing": {
      "type": "string"
    }
  },
  "additionalProperties": false,
  "required": ["job_type", "job_tier", "job_briefing"]
}

━━━━━━━━━━━━━━━━━━━━━━━
1. Job Type
━━━━━━━━━━━━━━━━━━━━━━━

Jobs can be one of the following types:
- operations
- maintenance
- engineering
- management
- executive
- other

Sort each job into exactly one of the types that best fits it.

━━━━━━━━━━━━━━━━━━━━━━━
2. Job Tier
━━━━━━━━━━━━━━━━━━━━━━━

Jobs can be one of the following tiers:
- Entry & Mid Level (Associated Output: entry_mid)
- Senior & Management (Associated Output: senior_management)
- Director, VP & C-Level (Associated Output: director_vp_c_level)

Sort each job into exactly one of the tiers that best fits it.

Tier Definitions:

Entry & Mid Level: hourly, administrative, and early-career salaried positions.
Senior & Management: Experienced professionals and people leaders, including salaried, supervisory and management positions with greater responsibility, broader scope, and stronger compensation alignment.
Director, VP & C-Level: Executive and leadership-level opportunities aligned with strategic responsibility, organizational impact, and compensation range.

━━━━━━━━━━━━━━━━━━━━━━━
3. Job Briefing
━━━━━━━━━━━━━━━━━━━━━━━

The briefing should include the following:
- Company history and background
- Company size and industry information
- Employee count (If provided)
- Job-specific insights and details

━━━━━━━━━━━━━━━━━━━━━━━
FINAL INSTRUCTIONS (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━

• Do NOT add additional explanations
• Do NOT add additional comments
• Output must be a valid JSON object with the specified structure, nothing more
• ALL 3 output tasks must be accounted for in the final object"""


def enrich_jobs_user_message(payload: dict[str, object]) -> str:
    return f"""━━━━━━━━━━━━━━━━━━━━━━━
INPUT
━━━━━━━━━━━━━━━━━━━━━━━

JOB TITLE: 

{payload.get("job_title", "")}

JOB DESCRIPTION:
{payload.get("description", "")}

COMPANY NAME: 
{payload.get("company_name", "")}

COMPANY DOMAIN:
{payload.get("company_domain", "")}

COMPANY DESCRIPTION: 
{payload.get("company_description", "")}

EMPLOYEE COUNT:
{payload.get("employee_count", "")}

SIC CODE:
{payload.get("sic_code", "")}

NAICS CODE:
{payload.get("naics_code", "")}

INDUSTRY:
{payload.get("industry", "")}
"""


DOMAIN_SYSTEM = """You will be given a list of website content, with the HTML removed. Find the ONE offical website, if it exists. For reference here is a job posting by the company:

OUTPUT:
A single URL, or null. Do not include any additional comments or explanations."""


def domain_user_message(
    job_title: str,
    company_name: str,
    location: str | None,
    url_snippets: list[tuple[str, str]],
) -> str:
    parts = [
        f"Job Title: {job_title}",
        f"Company Name: {company_name}",
        f"Location: {location or ''}",
        "",
        "POSSIBLE WEBSITES:",
    ]
    for url, text in url_snippets:
        parts.append(f"URL: {url} \nWebsite Content: {text}")
        parts.append("")
    return "\n".join(parts)
