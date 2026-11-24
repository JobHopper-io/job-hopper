# Day 3 reverse-recruiting dry run

Generated 2026-11-24T19:53:28.864Z by `scripts/day3-shortlist-test.mjs` (read-only against hosted; nothing written back).

- Sample: 20 of 30 approved job-seeker prospects that have a career level, picked for variety in title and level.
- Matcher: live `matching_algorithm_config` (min score 45) with a 60-day window; top 10 candidates per prospect.
- Jobs in the window by level: entry_mid 585, senior_management 437. Note: job ingestion has been stopped since 2026-11-12 (LLM provider outage), so recent weeks are thin.
- Verification: candidates checked in score order until 5 are verified open or candidates run out. ATS APIs (Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Workable) and iCIMS/BambooHR pages give open/closed; any other host gets a generic page check (closed phrases or expired JobPosting validThrough = closed, valid JobPosting JSON-LD = likely_open). Indeed is never checked.
- Shortlist: open jobs first, then likely_open jobs posted within 21 days; never closed, unverified or Indeed; at most 5.

## Before / after

Same 20 prospects, same 60-day window. Candidates verified per prospect can differ slightly between runs because verification stops once 5 jobs are open.

| | Run 1 (ATS APIs only) | This run (+ Workday, Workable, generic page) |
|---|---|---|
| Verified open | 12 | **21** |
| Likely open | 0 | **8** |
| Closed | 8 | **19** |
| Unverified | 75 | **47** |
| Prospects with 3+ verified open | 1 / 20 | **3 / 20** |
| Prospects with a 3+ job shortlist | 1 / 20 | **3 / 20** |

## Summary

| | Total |
|---|---|
| Prospects run | 20 (skipped 0) |
| Jobs matched (all, before top-10 cut) | 424 |
| Candidates verified | 95 |
| Verified open | 21 |
| Likely open (page JSON-LD) | 8 |
| Closed | 19 |
| Unverified | 47 |
| Prospects with 3+ verified-open jobs | **3 / 20** |
| Prospects with a 3+ job shortlist | **3 / 20** |
| Shortlist sizes | 0: 8, 1: 5, 2: 4, 3: 1, 4: 2, 5: 0 |

## Closed-job rate by host

Unique apply links checked (a job shared by several prospects is checked once). Closed rate = closed / (open + likely open + closed).

| Host | Open | Likely open | Closed | Unverified | Closed rate |
|---|---|---|---|---|---|
| workday | 6 | 0 | 3 | 1 | 33% |
| icims | 2 | 0 | 4 | 0 | 67% |
| ashby | 3 | 0 | 1 | 0 | 25% |
| indeed | 0 | 0 | 0 | 4 | – |
| workable | 3 | 0 | 0 | 1 | 0% |
| jpmorganchase.contacthr.com | 0 | 0 | 0 | 3 | – |
| jsv3.recruitics.com | 0 | 3 | 0 | 0 | 0% |
| greenhouse | 0 | 0 | 2 | 0 | 100% |
| jobs.thecignagroup.com | 0 | 0 | 2 | 0 | 100% |
| bamboohr | 0 | 0 | 1 | 0 | 100% |
| block.xyz | 0 | 0 | 0 | 1 | – |
| careers.google.com | 0 | 0 | 0 | 1 | – |
| careers.mta.org | 0 | 0 | 0 | 1 | – |
| careers.paychex.com | 0 | 0 | 0 | 1 | – |
| careers.te.com | 0 | 0 | 0 | 1 | – |
| careers.tiktokusds.com | 0 | 0 | 0 | 1 | – |
| click.appcast.io | 0 | 0 | 0 | 1 | – |
| decircletalentpartner.recruitee.com | 0 | 1 | 0 | 0 | 0% |
| delan-associates-inc.breezy.hr | 0 | 0 | 1 | 0 | 100% |
| ht-jobs.net | 0 | 0 | 0 | 1 | – |
| jobs.gem.com | 0 | 0 | 0 | 1 | – |
| lever | 1 | 0 | 0 | 0 | 0% |
| nask.world | 0 | 0 | 0 | 1 | – |
| parkercareers.ttcportals.com | 0 | 0 | 0 | 1 | – |
| paycomonline.net | 0 | 1 | 0 | 0 | 0% |
| peerless.hrmdirect.com | 0 | 0 | 0 | 1 | – |
| recruiting.paylocity.com | 0 | 1 | 0 | 0 | 0% |
| recruiting2.ultipro.com | 0 | 0 | 0 | 1 | – |
| smartrecruiters | 1 | 0 | 0 | 0 | 0% |
| usource.ripplehire.com | 0 | 0 | 0 | 1 | – |

## Per prospect

| Prospect | Level | Target title | Matched | Checked | Open | Likely open | Closed | Unverified | Shortlist |
|---|---|---|---|---|---|---|---|---|---|
| `2274b35a-49bf-4dee-9e6b-57487c92e006` | entry_mid | Full Stack Engineer | 2 | 2 | 0 | 1 | 1 | 0 | 0 |
| `156f04a0-6a39-46c6-8e48-60b41308649d` | senior_management | Software Engineer | 107 | 10 | 1 | 1 | 1 | 7 | 2 |
| `4a9e91e8-f91b-4ce4-a4d1-ffdc22d538c4` | entry_mid | Backend Engineer | 2 | 2 | 1 | 0 | 0 | 1 | 1 |
| `2908bd6d-ec42-4b03-992c-e60b4d5ae770` | senior_management | AI Engineer | 2 | 2 | 1 | 0 | 1 | 0 | 1 |
| `6fcd725f-a313-4685-86c9-acc5541959be` | entry_mid | Machine Learning Engineer | 4 | 4 | 2 | 0 | 1 | 1 | 2 |
| `2c6eef4a-1589-4f36-8fb5-c3d48bb08e97` | senior_management | Staff Backend Engineer | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| `b07eab90-988d-45e9-b2eb-f0d6d269ae09` | entry_mid | Data Engineer | 1 | 1 | 1 | 0 | 0 | 0 | 1 |
| `31e7f081-4239-4293-9f60-b7a413d1029d` | senior_management | Senior AI Software Engineer | 8 | 8 | 3 | 0 | 1 | 4 | 3 |
| `b0eeb086-ee87-479e-a288-8ed32065dcb0` | entry_mid | Ai/ml Engineer | 6 | 6 | 4 | 0 | 2 | 0 | 4 |
| `3c6828b2-bbcd-4ddc-833a-cd732019c907` | senior_management | Senior Software Engineer | 48 | 10 | 3 | 1 | 1 | 5 | 4 |
| `e11aa44a-8453-4b7f-a6c2-d1b301e1b947` | entry_mid | Infrastructure Engineer | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `471cc727-b820-441c-b1e6-7e46027872bf` | senior_management | Data Scientist | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `f53a4fa4-7551-445f-90e4-01367153ef95` | entry_mid | Security Engineer | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| `756ca530-c7f5-4250-bb6c-0c65d91f017b` | senior_management | Engineering Manager | 6 | 6 | 0 | 1 | 1 | 4 | 0 |
| `82d2eeb4-7650-4b84-8cac-2e927d2dbe7d` | senior_management | Site Reliability Engineer | 1 | 1 | 1 | 0 | 0 | 0 | 1 |
| `bab1f652-429b-4e12-a948-62dae7f267dd` | senior_management | iOS Engineer | 1 | 1 | 0 | 0 | 1 | 0 | 0 |
| `d1de83cc-a8bb-44d2-b7a8-d66b68bdcf0f` | senior_management | Embedded Software Engineer | 22 | 10 | 1 | 2 | 3 | 4 | 1 |
| `e8104733-5a73-48df-83af-f251f3294790` | senior_management | Principal Software Engineer | 25 | 10 | 2 | 0 | 1 | 7 | 2 |
| `2dcd5085-8a5e-495e-8ed2-675a1a539ce7` | entry_mid | Software Engineer | 80 | 10 | 0 | 1 | 4 | 5 | 0 |
| `af10849b-18d0-4ca0-9506-418116d20dae` | senior_management | Software Engineer | 107 | 10 | 1 | 1 | 1 | 7 | 2 |

## Shortlists

### `156f04a0-6a39-46c6-8e48-60b41308649d` (Software Engineer, senior_management) — too_few

- **Staff Software Engineer, Ads** — GameChanger, New York, NY (remote) · posted 2026-10-02 · [apply](https://jobs.ashbyhq.com/gamechanger/ab2e0563-739f-4fe4-bdce-0aea2dd76ea1?utm_source=WnPNpVYelj) · verified open (ashby_api 200)
  - Title matches your target role (Software Engineer)
  - Remote role, and you're open to remote work
  - Senior & Management role, matching your experience level
- **Senior Software Engineer** — ThermoWorks, American Fork, UT 84003 · posted 2026-11-04 · [apply](https://www.paycomonline.net/v4/ats/web.php/portal/10A7D67A8C0FF7742ECF707B8D6CB053/jobs/511401?source=Indeed) · likely open (generic_page 200)
  - Title matches your target role (Software Engineer)
  - Senior & Management role, matching your experience level

### `4a9e91e8-f91b-4ce4-a4d1-ffdc22d538c4` (Backend Engineer, entry_mid) — too_few

- **Backend Engineer** — Gallatin, New York, NY · posted 2026-10-09 · [apply](https://jobs.ashbyhq.com/gallatin/8de1a441-15aa-4993-a0f5-d76be215b139?utm_source=qZyxO8XDee) · verified open (ashby_api 200)
  - Title matches your target role (Backend Engineer)
  - Entry & Mid Level role, matching your experience level

### `2908bd6d-ec42-4b03-992c-e60b4d5ae770` (AI Engineer, senior_management) — too_few

- **AI Engineer** — Services For The Underserved, New York, NY 10018 · posted 2026-10-02 · [apply](https://careers-sus.icims.com/jobs/18997/job?utm_source=indeed_integration&iis=Job%20Board&iisn=Indeed&indeed-apply-token=73a2d2b2a8d6d5c0a62696875eaebd669103652d3f0c2cd5445d3e66b1592b0f) · verified open (icims_page 200)
  - Title matches your target role (AI Engineer)
  - Senior & Management role, matching your experience level

### `6fcd725f-a313-4685-86c9-acc5541959be` (Machine Learning Engineer, entry_mid) — too_few

- **2027 Summer Intern – Machine Learning Engineer, AV/AI Platform** — General Motors (GM), Sunnyvale, CA · posted 2026-10-02 · [apply](https://generalmotors.wd5.myworkdayjobs.com/en-US/Careers_GM/job/Sunnyvale-California-United-States-of-America/XMLNAME-2027-Summer-Intern---Machine-Learning-Engineer--AV-AI-Platform_JR-202621695) · verified open (workday_api 200)
  - Title matches your target role (Machine Learning Engineer)
  - Entry & Mid Level role, matching your experience level
- **2027 Summer Internship - Machine Learning Engineer** — Q2ebanking, Cary, NC · posted 2026-09-29 · [apply](https://q2ebanking.wd5.myworkdayjobs.com/en-US/Q2/job/Cary-North-Carolina/XMLNAME-2027-Summer-Internship---Machine-Learning-Engineer_REQ-12800) · verified open (workday_api 200)
  - Title matches your target role (Machine Learning Engineer)
  - Entry & Mid Level role, matching your experience level

### `b07eab90-988d-45e9-b2eb-f0d6d269ae09` (Data Engineer, entry_mid) — too_few

- **Data Engineer - Talent Acquisition Operations** — Palantir Technologies, New York, NY 10011 · posted 2026-10-07 · [apply](https://jobs.lever.co/palantir/1b690123-1766-4e75-a0ef-0f58afa864b4) · verified open (lever_api 200)
  - Title matches your target role (Data Engineer)
  - Entry & Mid Level role, matching your experience level

### `31e7f081-4239-4293-9f60-b7a413d1029d` (Senior AI Software Engineer, senior_management) — ready

- **Senior AI Software Engineer** — Credence, Wright-Patterson AFB, OH · posted 2026-10-19 · [apply](https://apply.workable.com/j/E050201701) · verified open (workable_api 200)
  - Title matches your target role (Senior AI Software Engineer)
  - Senior & Management role, matching your experience level
- **Staff Software Engineer, Ads** — GameChanger, New York, NY (remote) · posted 2026-10-02 · [apply](https://jobs.ashbyhq.com/gamechanger/ab2e0563-739f-4fe4-bdce-0aea2dd76ea1?utm_source=WnPNpVYelj) · verified open (ashby_api 200)
  - Title shares "software" with your target role (Senior AI Software Engineer)
  - Remote role, and you're open to remote work
  - Senior & Management role, matching your experience level
- **Senior AI Software Engineer** — Credence, Rome, NY · posted 2026-10-05 · [apply](https://apply.workable.com/j/C058746167) · verified open (workable_api 200)
  - Title matches your target role (Senior AI Software Engineer)
  - Senior & Management role, matching your experience level

### `b0eeb086-ee87-479e-a288-8ed32065dcb0` (Ai/ml Engineer, entry_mid) — ready

- **2027 Summer Intern - AI/ML Engineer, Autonomous Vehicle: Simulation** — General Motors (GM), Sunnyvale, CA · posted 2026-10-01 · [apply](https://generalmotors.wd5.myworkdayjobs.com/en-US/Careers_GM/job/Sunnyvale-California-United-States-of-America/XMLNAME-2027-Summer-Intern---AI-ML-Engineer--Autonomous-Vehicle--Simulation_JR-202621508) · verified open (workday_api 200)
  - Title matches your target role (Ai/ml Engineer)
  - Entry & Mid Level role, matching your experience level
- **2027 Summer Intern, AI/ML Engineer, Mapping** — General Motors (GM), Warren, MI · posted 2026-10-05 · [apply](https://generalmotors.wd5.myworkdayjobs.com/en-US/Careers_GM/job/Warren-Michigan-United-States-of-America/XMLNAME-2027-Summer-Intern--AI-ML-Engineer--Mapping_JR-202621778) · verified open (workday_api 200)
  - Title matches your target role (Ai/ml Engineer)
  - Entry & Mid Level role, matching your experience level
- **2027 Summer Intern – AI/ML Engineer, Autonomous Vehicles: Simulation (PhD)** — General Motors (GM), Sunnyvale, CA · posted 2026-10-01 · [apply](https://generalmotors.wd5.myworkdayjobs.com/en-US/Careers_GM/job/Sunnyvale-California-United-States-of-America/XMLNAME-2027-Summer-Intern---AI-ML-Engineer--Autonomous-Vehicles--Simulation--PhD-_JR-202621511) · verified open (workday_api 200)
  - Title matches your target role (Ai/ml Engineer)
  - Entry & Mid Level role, matching your experience level
- **Governance Engineer II - Remote** — CSAA Insurance Group, a AAA Insurer, New York, NY (remote) · posted 2026-10-05 · [apply](https://aaaie.wd1.myworkdayjobs.com/CSAACareers/job/Arizona---Home-Teleworkers/Governance-Engineer-II---Remote_R7942) · verified open (workday_api 200)
  - Remote role, and you're open to remote work
  - Entry & Mid Level role, matching your experience level

### `3c6828b2-bbcd-4ddc-833a-cd732019c907` (Senior Software Engineer, senior_management) — ready

- **Staff Software Engineer, Ads** — GameChanger, New York, NY (remote) · posted 2026-10-02 · [apply](https://jobs.ashbyhq.com/gamechanger/ab2e0563-739f-4fe4-bdce-0aea2dd76ea1?utm_source=WnPNpVYelj) · verified open (ashby_api 200)
  - Title shares "software" with your target role (Senior Software Engineer)
  - Remote role, and you're open to remote work
  - Senior & Management role, matching your experience level
- **Senior Software Engineer, Ad Code** — Raptive, New York, NY · posted 2026-10-27 · [apply](https://jobs.ashbyhq.com/raptive/cb789a70-1e0a-4028-827c-7137e4545f2b?utm_source=NmzoY42ZgZ) · verified open (ashby_api 200)
  - Title matches your target role (Senior Software Engineer)
  - Senior & Management role, matching your experience level
- **Senior Software Engineer** — Advanced Drainage Systems, Hilliard, OH 43026 · posted 2026-10-22 · [apply](https://careers-adspipe.icims.com/jobs/23480/job?utm_source=indeed_integration&iis=Job%20Board&iisn=Indeed&indeed-apply-token=73a2d2b2a8d6d5c0a62696875eaebd669103652d3f0c2cd5445d3e66b1592b0f) · verified open (icims_page 200)
  - Title matches your target role (Senior Software Engineer)
  - Senior & Management role, matching your experience level
- **Senior Software Engineer** — ThermoWorks, American Fork, UT 84003 · posted 2026-11-04 · [apply](https://www.paycomonline.net/v4/ats/web.php/portal/10A7D67A8C0FF7742ECF707B8D6CB053/jobs/511401?source=Indeed) · likely open (generic_page 200)
  - Title matches your target role (Senior Software Engineer)
  - Senior & Management role, matching your experience level

### `82d2eeb4-7650-4b84-8cac-2e927d2dbe7d` (Site Reliability Engineer, senior_management) — too_few

- **Senior Site Reliability Engineer, Platform Infrastructure** — Cricut, South Jordan, UT · posted 2026-09-30 · [apply](https://jobs.smartrecruiters.com/Cricut/744000152782108-senior-site-reliability-engineer-platform-infrastructure) · verified open (smartrecruiters_api 200)
  - Title matches your target role (Site Reliability Engineer)
  - Senior & Management role, matching your experience level

### `d1de83cc-a8bb-44d2-b7a8-d66b68bdcf0f` (Embedded Software Engineer, senior_management) — too_few

- **Staff Software Engineer, Ads** — GameChanger, New York, NY (remote) · posted 2026-10-02 · [apply](https://jobs.ashbyhq.com/gamechanger/ab2e0563-739f-4fe4-bdce-0aea2dd76ea1?utm_source=WnPNpVYelj) · verified open (ashby_api 200)
  - Title shares "software" with your target role (Embedded Software Engineer)
  - Remote role, and you're open to remote work
  - Senior & Management role, matching your experience level

### `e8104733-5a73-48df-83af-f251f3294790` (Principal Software Engineer, senior_management) — too_few

- **Staff Software Engineer, Ads** — GameChanger, New York, NY (remote) · posted 2026-10-02 · [apply](https://jobs.ashbyhq.com/gamechanger/ab2e0563-739f-4fe4-bdce-0aea2dd76ea1?utm_source=WnPNpVYelj) · verified open (ashby_api 200)
  - Title shares "software" with your target role (Principal Software Engineer)
  - Remote role, and you're open to remote work
  - Senior & Management role, matching your experience level
- **Principal Software Engineer - Workload Communications Domain Lead** — SciTec, Dayton, OH · posted 2026-10-09 · [apply](https://apply.workable.com/j/5E373ED521) · verified open (workable_api 200)
  - Title matches your target role (Principal Software Engineer)
  - Senior & Management role, matching your experience level

### `af10849b-18d0-4ca0-9506-418116d20dae` (Software Engineer, senior_management) — too_few

- **Staff Software Engineer, Ads** — GameChanger, New York, NY (remote) · posted 2026-10-02 · [apply](https://jobs.ashbyhq.com/gamechanger/ab2e0563-739f-4fe4-bdce-0aea2dd76ea1?utm_source=WnPNpVYelj) · verified open (ashby_api 200)
  - Title matches your target role (Software Engineer)
  - Remote role, and you're open to remote work
  - Senior & Management role, matching your experience level
- **Senior Software Engineer** — ThermoWorks, American Fork, UT 84003 · posted 2026-11-04 · [apply](https://www.paycomonline.net/v4/ats/web.php/portal/10A7D67A8C0FF7742ECF707B8D6CB053/jobs/511401?source=Indeed) · likely open (generic_page 200)
  - Title matches your target role (Software Engineer)
  - Senior & Management role, matching your experience level
