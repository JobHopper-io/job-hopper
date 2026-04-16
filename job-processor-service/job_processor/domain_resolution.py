from __future__ import annotations

import asyncio
import logging
import httpx
from openai import AsyncOpenAI

from job_processor.external_apis import brave_web_search, fetch_url_text
from job_processor.llm_ops import chat_text
from job_processor.prompts import DOMAIN_SYSTEM, domain_user_message
from job_processor.settings import Settings
from job_processor.text_utils import strip_html_to_text

logger = logging.getLogger(__name__)


def _truncate(s: str, max_len: int = 6000) -> str:
    if len(s) <= max_len:
        return s
    return s[:max_len] + "…"


async def resolve_company_domain(
    *,
    http_client: httpx.AsyncClient,
    settings: Settings,
    openai_client: AsyncOpenAI,
    model: str,
    job_title: str,
    company_name: str,
    location: str | None,
    sem_brave: asyncio.Semaphore,
    sem_fetch: asyncio.Semaphore,
    sem_llm: asyncio.Semaphore,
) -> str | None:
    q_piece = company_name.replace(" ", "+")
    query = f"{q_piece} official website"
    async with sem_brave:
        urls = await brave_web_search(http_client, settings, query)
    if not urls:
        return None

    async def one(url: str) -> tuple[str, str]:
        async with sem_fetch:
            html = await fetch_url_text(http_client, settings, url)
        text = _truncate(strip_html_to_text(html))
        return url, text

    raw_pairs = await asyncio.gather(*[one(u) for u in urls], return_exceptions=True)
    pairs: list[tuple[str, str]] = []
    for u, res in zip(urls, raw_pairs):
        if isinstance(res, BaseException):
            logger.warning("domain fetch failed url=%s: %s", u, res)
            pairs.append((u, ""))
        else:
            pairs.append(res)
    url_snippets = [(u, t) for u, t in pairs][:12]
    if not url_snippets:
        url_snippets = [(u, "") for u in urls[:12]]

    async with sem_llm:
        raw = await chat_text(
            openai_client,
            model,
            DOMAIN_SYSTEM,
            domain_user_message(job_title, company_name, location, url_snippets),
        )

    out = (raw or "").strip().strip("`\"'")
    if not out or out.lower() == "null":
        return None
    return out
