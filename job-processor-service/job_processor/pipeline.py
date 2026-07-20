from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from job_processor.domain_resolution import resolve_company_domain
from job_processor.external_apis import apollo_organization_enrich
from job_processor.llm_ops import chat_text, openai_client
from job_processor.merges import (
    anti_join_bd_leads,
    anti_join_company_name,
    anti_join_live_jobs,
    dedupe_by_key,
    normalize_filter_token,
)
from job_processor.models import RunOptions
from job_processor.prompts import (
    ENRICH_JOBS_SYSTEM,
    FILTER_ENGINE_SYSTEM,
    enrich_jobs_user_message,
    filter_engine_user_message,
)
from job_processor.settings import Settings
from job_processor.supabase_client import SupabaseRest
from job_processor.text_utils import parse_json_from_code_block

logger = logging.getLogger(__name__)

ROLE_CATEGORIES = frozenset(
    {"operations", "maintenance", "engineering", "management", "executive", "other"}
)


def _normalize_fields(
    job: dict[str, Any],
    company_domain: str | None,
    apollo_org: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": job["id"],
        "job_title": job.get("job_title") or "",
        "company_name": job.get("company_name") or "",
        "location": job.get("location"),
        "is_remote": bool(job.get("is_remote")),
        "pay_min": job.get("pay_min"),
        "pay_max": job.get("pay_max"),
        "pay_type": job.get("pay_type"),
        "schedules": job.get("schedules") or [],
        "employment_types": job.get("employment_types") or [],
        "description": job.get("description") or "",
        "apply_link": job.get("apply_link"),
        "posted_date": job.get("posted_date"),
        "company_domain": company_domain,
        "employee_count": int(apollo_org.get("estimated_num_employees") or 0),
        "sic_code": (apollo_org.get("sic_codes") or [None])[0],
        "naics_code": (apollo_org.get("naics_codes") or [None])[0],
        "industry": apollo_org.get("industry") or "Unknown",
        "company_description": apollo_org.get("short_description") or "",
    }


def _coerce_role_category(value: str | None) -> str:
    v = (value or "other").strip().lower()
    return v if v in ROLE_CATEGORIES else "other"


async def process_one_job(
    job: dict[str, Any],
    *,
    db: SupabaseRest,
    settings: Settings,
    http_client: httpx.AsyncClient,
    oai: Any,
    options: RunOptions,
    excluded: list[dict[str, Any]],
    bd_leads: list[dict[str, Any]],
    live_jobs: list[dict[str, Any]],
    shared_apollo_exhausted: list[bool],
    dedupe_lock: asyncio.Lock,
    sem_llm: asyncio.Semaphore,
    sem_apollo: asyncio.Semaphore,
    sem_brave: asyncio.Semaphore,
    sem_fetch: asyncio.Semaphore,
    model_filter: str,
    model_enrich: str,
    model_domain: str,
) -> dict[str, int]:
    """Process a single claimed raw job. Returns count deltas."""
    deltas = {
        "processed": 0,
        "inserted_live": 0,
        "inserted_exclusion": 0,
        "inserted_bd": 0,
        "errors": 0,
    }
    job_id = str(job["id"])

    company_domain: str | None = None
    if shared_apollo_exhausted[0] and not options.skip_apollo:
        pass
    elif not options.skip_domain_resolution:
        company_domain = await resolve_company_domain(
            http_client=http_client,
            settings=settings,
            openai_client=oai,
            model=model_domain,
            job_title=job.get("job_title") or "",
            company_name=job.get("company_name") or "",
            location=job.get("location"),
            sem_brave=sem_brave,
            sem_fetch=sem_fetch,
            sem_llm=sem_llm,
        )

    apollo_body: dict[str, Any] | None = None
    if company_domain and not options.skip_apollo and not shared_apollo_exhausted[0]:
        async with sem_apollo:
            if shared_apollo_exhausted[0]:
                apollo_body = None
            else:
                consumed_row = await db.try_consume_apollo_credits(
                    "job_processor", 1, dry_run=options.dry_run
                )
                if not consumed_row.get("ok"):
                    shared_apollo_exhausted[0] = True
                    apollo_body = None
                else:
                    apollo_body, credit_err = await apollo_organization_enrich(
                        http_client, settings, company_domain
                    )
                    if credit_err:
                        await db.refund_apollo_credits(
                            "job_processor", 1, dry_run=options.dry_run
                        )
                        shared_apollo_exhausted[0] = True
                        await db.set_apollo_credits_exhausted(True, options.dry_run)
                        apollo_body = None
                    elif apollo_body is None:
                        await db.refund_apollo_credits(
                            "job_processor", 1, dry_run=options.dry_run
                        )

    apollo_org = (apollo_body or {}).get("organization") or {}
    if not isinstance(apollo_org, dict):
        apollo_org = {}

    norm = _normalize_fields(job, company_domain, apollo_org)

    filter_user = filter_engine_user_message(
        {
            "job_title": norm["job_title"],
            "company_name": norm["company_name"],
            "company_description": norm["company_description"],
            "employee_count": norm["employee_count"],
            "sic_code": norm["sic_code"],
            "naics_code": norm["naics_code"],
            "industry": norm["industry"],
        }
    )
    async with sem_llm:
        raw_filter = await chat_text(oai, model_filter, FILTER_ENGINE_SYSTEM, filter_user)
    filter_token = normalize_filter_token(raw_filter)

    if filter_token == "exclusion_lists":
        row = {"company_name": norm["company_name"]}
        async with dedupe_lock:
            candidates = dedupe_by_key([row], ["company_name"])
            candidates = anti_join_company_name(candidates, excluded)
            if candidates:
                await db.insert_exclusion_list(norm["company_name"], dry_run=options.dry_run)
                deltas["inserted_exclusion"] += 1
                if not options.dry_run:
                    excluded.append({"company_name": norm["company_name"]})
        await db.update_raw_job_status(job_id, "processed", dry_run=options.dry_run)
        deltas["processed"] += 1
        return deltas

    if filter_token not in ("job_hopper_live", "bd_leads"):
        filter_token = "job_hopper_live"

    ec = norm["employee_count"]
    if 11 <= ec <= 150:
        async with dedupe_lock:
            bd_row = {"company_name": norm["company_name"]}
            bd_c = dedupe_by_key([bd_row], ["company_name"])
            bd_c = anti_join_bd_leads(bd_c, bd_leads)
            if bd_c:
                await db.insert_bd_lead(
                    norm["company_name"], "Ready to Process", dry_run=options.dry_run
                )
                deltas["inserted_bd"] += 1
                if not options.dry_run:
                    bd_leads.append({"company_name": norm["company_name"]})

    live_candidate = {
        "job_title": norm["job_title"],
        "company_name": norm["company_name"],
        "apply_link": norm.get("apply_link"),
        "posted_date": norm.get("posted_date"),
    }
    async with dedupe_lock:
        live_c = dedupe_by_key([live_candidate], ["job_title", "company_name", "apply_link"])
        live_c = anti_join_live_jobs(live_c, live_jobs)
        do_live = bool(live_c)

    if do_live:
        if options.skip_enrichment:
            enrich: dict[str, Any] = {
                "job_type": "other",
                "job_tier": "entry_mid",
                "job_briefing": "",
            }
        else:
            enrich_user = enrich_jobs_user_message(norm)
            async with sem_llm:
                raw_enrich = await chat_text(oai, model_enrich, ENRICH_JOBS_SYSTEM, enrich_user)
            enrich = parse_json_from_code_block(raw_enrich) or {
                "job_type": "other",
                "job_tier": "entry_mid",
                "job_briefing": raw_enrich[:8000] if raw_enrich else "",
            }

        role_cat = _coerce_role_category(str(enrich.get("job_type", "other")))
        tier = str(enrich.get("job_tier", "entry_mid"))
        briefing = str(enrich.get("job_briefing", ""))

        insert_row: dict[str, Any] = {
            "job_title": norm["job_title"],
            "company_name": norm["company_name"],
            "location": norm["location"],
            "is_remote": norm["is_remote"],
            "pay_min": norm["pay_min"],
            "pay_max": norm["pay_max"],
            "pay_type": norm["pay_type"],
            "schedules": norm["schedules"],
            "employment_types": norm["employment_types"],
            "description": norm["description"] or None,
            "apply_link": norm["apply_link"],
            "posted_date": norm["posted_date"],
            "employee_count": norm["employee_count"] or None,
            "company_domain": norm["company_domain"],
            "ai_job_briefing": briefing,
            "role_category": role_cat,
            "subscription_tier": tier,
            "sponsorship_likelihood": settings.default_sponsorship_likelihood,
        }
        async with dedupe_lock:
            live_c2 = dedupe_by_key(
                [live_candidate], ["job_title", "company_name", "apply_link"]
            )
            live_c2 = anti_join_live_jobs(live_c2, live_jobs)
            if live_c2:
                await db.insert_job_hopper_live(insert_row, dry_run=options.dry_run)
                deltas["inserted_live"] += 1
                if not options.dry_run:
                    live_jobs.append(
                        {
                            "company_name": norm["company_name"],
                            "job_title": norm["job_title"],
                            "apply_link": norm.get("apply_link"),
                            "posted_date": norm.get("posted_date"),
                            "created_at": datetime.now(tz=timezone.utc).isoformat(),
                        }
                    )

    await db.update_raw_job_status(job_id, "processed", dry_run=options.dry_run)
    deltas["processed"] += 1
    return deltas


async def run_pipeline(
    run_id: str,
    settings: Settings,
    http_client: httpx.AsyncClient,
) -> None:
    db = SupabaseRest(settings, http_client)
    run_row = await db.get_run(run_id)
    if not run_row:
        raise ValueError(f"run not found: {run_id}")

    options = RunOptions.model_validate(run_row.get("options") or {})

    if options.force_clear_apollo_limit:
        await db.set_apollo_credits_exhausted(False, options.dry_run)

    flags_row = await db.get_processor_flags()
    shared_apollo_exhausted: list[bool] = [bool(flags_row.get("apollo_credits_exhausted"))]

    counts: dict[str, int] = {
        "claimed": 0,
        "processed": 0,
        "errors": 0,
        "inserted_live": 0,
        "inserted_exclusion": 0,
        "inserted_bd": 0,
    }

    started = datetime.now(tz=timezone.utc).isoformat()
    await db.update_run(run_id, status="running", started_at=started, counts=counts)

    excluded = await db.fetch_all_table("exclusion_lists")
    bd_leads = await db.fetch_all_table("bd_leads")
    live_jobs = await db.fetch_all_table("job_hopper_live")

    oai = openai_client(settings)
    model_filter = options.model_filter or settings.llm_model_filter
    model_enrich = options.model_enrich or settings.llm_model_enrich
    model_domain = options.model_domain or settings.llm_model_domain

    sem_llm = asyncio.Semaphore(options.max_concurrent_llm)
    sem_apollo = asyncio.Semaphore(options.max_concurrent_apollo)
    sem_brave = asyncio.Semaphore(options.max_concurrent_brave)
    sem_fetch = asyncio.Semaphore(options.max_concurrent_fetch)
    sem_jobs = asyncio.Semaphore(options.max_concurrent_jobs)
    dedupe_lock = asyncio.Lock()
    counts_lock = asyncio.Lock()

    async def process_job_task(job: dict[str, Any]) -> None:
        async with sem_jobs:
            try:
                d = await process_one_job(
                    job,
                    db=db,
                    settings=settings,
                    http_client=http_client,
                    oai=oai,
                    options=options,
                    excluded=excluded,
                    bd_leads=bd_leads,
                    live_jobs=live_jobs,
                    shared_apollo_exhausted=shared_apollo_exhausted,
                    dedupe_lock=dedupe_lock,
                    sem_llm=sem_llm,
                    sem_apollo=sem_apollo,
                    sem_brave=sem_brave,
                    sem_fetch=sem_fetch,
                    model_filter=model_filter,
                    model_enrich=model_enrich,
                    model_domain=model_domain,
                )
                async with counts_lock:
                    for k, v in d.items():
                        counts[k] = counts.get(k, 0) + v
            except Exception:
                logger.exception("job failed id=%s", job.get("id"))
                async with counts_lock:
                    counts["errors"] += 1
                try:
                    await db.update_raw_job_status(
                        str(job["id"]), "pending", dry_run=options.dry_run
                    )
                except Exception:
                    logger.exception("could not reset job %s", job.get("id"))

    try:
        total_claimed = 0
        while total_claimed < options.limit:
            batch_limit = min(options.batch_size, options.limit - total_claimed)
            jobs = await db.claim_scraper_raw_jobs(batch_limit)
            if not jobs:
                break
            n = len(jobs)
            total_claimed += n
            async with counts_lock:
                counts["claimed"] += n
                await db.update_run(run_id, counts=counts)
            await asyncio.gather(*(process_job_task(job) for job in jobs))
            async with counts_lock:
                await db.update_run(run_id, counts=counts)

        finished = datetime.now(tz=timezone.utc).isoformat()
        await db.update_run(
            run_id,
            status="completed",
            counts=counts,
            finished_at=finished,
            error_message=None,
        )
    except Exception as e:
        logger.exception("run failed")
        await db.update_run(
            run_id,
            status="failed",
            counts=counts,
            finished_at=datetime.now(tz=timezone.utc).isoformat(),
            error_message=str(e),
        )


async def run_pipeline_sync_same_process(
    run_id: str,
    settings: Settings,
) -> dict[str, int]:
    """Execute pipeline in-process (for sync API / tests)."""
    timeout = httpx.Timeout(settings.http_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout) as client:
        await run_pipeline(run_id, settings, client)
        row = await SupabaseRest(settings, client).get_run(run_id)
    return dict(row.get("counts") or {}) if row else {}
