# AI Job Briefings and Email Delivery – Job Hopper (Nick Schepis)

**SOW:** [nick-schepis-job-matching-mvp-app-sow.md](../../business-documents/nick-schepis-job-matching-mvp-app-sow.md) – Phase 3.

---

## AI job briefings

- **Content:** Company history/background, company size, industry, job-specific insights.
- **Trigger:** On demand when job is viewed (GET /jobs/:id) or when generating email for matched jobs. Cache by job id (e.g. table `job_hopper_briefings`: job_id, content, generated_at) to avoid duplicate AI calls.
- **Service:** Client provides AI service and key (e.g. OpenAI, Anthropic). Document env var e.g. `AI_API_KEY` and model. Do not hardcode keys.
- **Input:** job_hopper_jobs row + optional company_enrichment. Output: short markdown or plain text for email and in-app detail.

---

## Email delivery

- **When:** After matching run (daily or on new jobs); for new subscribers, first batch within 24h (Stage 5).
- **Template:** Subject line; body with list of jobs (title, company, briefing snippet, apply link). Include unsubscribe link and link to update preferences.
- **Provider:** Client provides transactional email service (e.g. Resend, SendGrid, Postmark). Document env vars and webhook for bounces/unsubscribes.
- **Unsubscribe:** Store preference in `job_hopper_subscriber_preferences` or a dedicated notifications table; exclude from future sends when unsubscribed.
