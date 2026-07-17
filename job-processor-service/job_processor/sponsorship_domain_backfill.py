"""D46-50 (§3 decision 11): backfill `employers.domain` for the scored employers.

Job postings have no existing link to `employers` - `job_hopper_live.company_name` is freeform
scraped text, and naive normalized-name matching against it is measurably lossy the same way §3
decision 4 found across DOL/USCIS (missed real top-374 sponsors like McKinsey and JPMorgan under
obvious spelling variants). The fix is to match on domain instead: `pipeline.py` already resolves
a company domain for every ingested job via `resolve_company_domain` (Brave + LLM, no Apollo
credits); this module runs the *same* function against each scored employer's `canonical_name` so
both sides of the eventual `job_hopper_live.company_domain = employers.domain` join go through
identical resolution logic, rather than two independently-normalized name pipelines.

Deliberately skips `excluded_from_scoring = true` employers (they never surface a score
regardless of domain match, so resolving their domain is pure wasted Brave/LLM spend) and
employers that already have a `domain` (idempotent/re-runnable).
"""

from __future__ import annotations

import asyncio
from typing import Any, TypedDict

import httpx
from openai import AsyncOpenAI

from job_processor.domain_resolution import resolve_company_domain
from job_processor.settings import Settings
from job_processor.supabase_client import SupabaseRest


class DomainBackfillCounts(TypedDict, total=False):
    employers_total: int
    excluded_skipped: int
    already_had_domain: int
    attempted: int
    resolved: int
    unresolved: int
    updated: int


async def _fetch_all_employers(db: SupabaseRest) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    offset, page = 0, 1000
    while True:
        rows = await db.select(
            "employers",
            select="id,canonical_name,domain,excluded_from_scoring",
            params=[("order", "id"), ("limit", str(page)), ("offset", str(offset))],
        )
        if not rows:
            break
        out.extend(rows)
        offset += len(rows)
        if len(rows) < page:
            break
    return out


async def backfill_employer_domains(
    db: SupabaseRest,
    *,
    settings: Settings,
    http_client: httpx.AsyncClient,
    oai: AsyncOpenAI,
    model: str,
    max_concurrent_brave: int = 2,
    max_concurrent_fetch: int = 8,
    max_concurrent_llm: int = 4,
    dry_run: bool,
) -> DomainBackfillCounts:
    employers = await _fetch_all_employers(db)
    excluded = [e for e in employers if e.get("excluded_from_scoring")]
    candidates = [e for e in employers if not e.get("excluded_from_scoring")]
    todo = [e for e in candidates if not e.get("domain")]

    sem_brave = asyncio.Semaphore(max_concurrent_brave)
    sem_fetch = asyncio.Semaphore(max_concurrent_fetch)
    sem_llm = asyncio.Semaphore(max_concurrent_llm)

    resolved: dict[str, str] = {}

    async def one(emp: dict[str, Any]) -> None:
        domain = await resolve_company_domain(
            http_client=http_client,
            settings=settings,
            openai_client=oai,
            model=model,
            job_title="",
            company_name=emp["canonical_name"],
            location=None,
            sem_brave=sem_brave,
            sem_fetch=sem_fetch,
            sem_llm=sem_llm,
        )
        if domain:
            resolved[emp["id"]] = domain

    await asyncio.gather(*(one(e) for e in todo))

    if not dry_run:
        for employer_id, domain in resolved.items():
            await db.patch_rows(
                "employers", {"domain": domain}, params=[("id", f"eq.{employer_id}")], dry_run=False
            )

    return {
        "employers_total": len(employers),
        "excluded_skipped": len(excluded),
        "already_had_domain": len(candidates) - len(todo),
        "attempted": len(todo),
        "resolved": len(resolved),
        "unresolved": len(todo) - len(resolved),
        "updated": len(resolved) if not dry_run else 0,
    }
