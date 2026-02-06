# Job Hopper – E2E Testing and Documentation (Nick Schepis)

**SOW:** [nick-schepis-job-matching-mvp-app-sow.md](../../business-documents/nick-schepis-job-matching-mvp-app-sow.md) – Phase 4.

---

## E2E and payment testing

- **Web:** Sign up at /signup → confirm row in job_hopper_subscribers and job_hopper_subscriber_preferences. After Stripe integration: complete checkout → webhook updates subscriber (stripe_customer_id, tier) → confirm in DB.
- **Stripe flows:** Test success, cancel, and payment failure; document how to run (e.g. Stripe test mode, test cards).
- **Matching:** Run matching on sample subscriber and job set; confirm “not too tight / not too loose” and document how to run (e.g. script or API call).
- **PWA:** Manual test in browser (and “Add to home screen”): login, dashboard, job list, subscription management. Optional: Playwright or similar for E2E; document in job-hopper-web/README.

---

## User and admin docs

- **User guide (web + app):** How to sign up, update preferences, manage subscription (Stripe portal or in-app), view matched jobs, unsubscribe. Place in docs/ or client-files/nick-schepis/.
- **Admin guide:** How to view subscribers (Supabase job_hopper_subscribers), adjust matching or content, use Stripe Dashboard for refunds/cancellations. Link from [admin-guide-job-scraping.md](./admin-guide-job-scraping.md) for scraping; add Job Hopper admin section there or in this file.
- **API summary:** Link to [job-hopper-api-spec.md](./job-hopper-api-spec.md). Include auth and base URL for app.
- **Troubleshooting:** Common issues (login fail, no matches, webhook not firing); add to [troubleshooting-job-scraping.md](./troubleshooting-job-scraping.md) or a dedicated job-hopper troubleshooting section.

---

## Matching validation

- Run matching on 2–3 sample personas (e.g. maintenance tech, plant manager, executive). Confirm result set is relevant and not empty when jobs exist. Tune thresholds in matching module if needed; document final rules in [matching-rules-job-hopper.md](./matching-rules-job-hopper.md).
