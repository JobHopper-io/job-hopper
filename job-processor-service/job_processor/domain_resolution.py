from __future__ import annotations

import asyncio
import logging
from urllib.parse import urlparse

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


def _hostname(url: str) -> str | None:
    host = urlparse(url).hostname
    if not host:
        return None
    return host.lower().removeprefix("www.")


# Reference/aggregator/social sites that regularly outrank a company's own site for
# "<company> official website" but are never themselves the official site. Brave-only
# mode (no LLM confirmation) falls through past these to the next result.
_NOT_A_COMPANY_SITE = {
    "wikipedia.org",
    "linkedin.com",
    "indeed.com",
    "glassdoor.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "youtube.com",
    "crunchbase.com",
    "bloomberg.com",
    "zoominfo.com",
    "ziprecruiter.com",
    "github.com",
    "builtin.com",
    "comparably.com",
    "themuse.com",
    "ambitionbox.com",
    "dnb.com",
    "bbb.org",
    "yelp.com",
    "owler.com",
    "simplyhired.com",
    "monster.com",
    "sec.gov",
    "cms.gov",
    "opencorporates.com",
}


def _is_blocklisted(host: str) -> bool:
    return any(host == d or host.endswith("." + d) for d in _NOT_A_COMPANY_SITE)


# Second-level indicators for the ccTLD-with-registrable-second-level pattern (co.uk,
# com.au, ...) - without this, apex extraction would truncate e.g. "example.co.uk" to
# "co.uk". Not a full public suffix list; sufficient for this project's scope (large,
# mostly-US employers).
_CCTLD_SECOND_LEVEL = {"co", "com", "org", "net", "gov", "edu", "ac"}


def _apex(host: str) -> str:
    """Collapse a subdomain (e.g. play.google.com) to its registrable domain
    (google.com), so it can exact-match a job posting's company_domain."""
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    if parts[-2] in _CCTLD_SECOND_LEVEL and len(parts[-1]) <= 3:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _first_company_hostname(urls: list[str]) -> str | None:
    for url in urls:
        host = _hostname(url)
        if host and not _is_blocklisted(host):
            return _apex(host)
    return None


def _clean_domain_response(raw: str) -> str | None:
    s = raw.strip()
    if not s or s.upper() == "NONE":
        return None
    host = urlparse(s).hostname if "://" in s else s.split("/")[0]
    if not host:
        return None
    return host.lower().removeprefix("www.")


async def _call_n8n_domain_resolver(
    http_client: httpx.AsyncClient,
    settings: Settings,
    company_name: str,
    candidate_urls: list[str],
) -> str | None:
    if not settings.n8n_domain_resolver_webhook_url:
        logger.warning("n8n_proxy requested but N8N_DOMAIN_RESOLVER_WEBHOOK_URL is unset")
        return None
    try:
        r = await http_client.post(
            settings.n8n_domain_resolver_webhook_url,
            json={"company_name": company_name, "candidate_urls": candidate_urls},
            headers={
                "Content-Type": "application/json",
                "X-Webhook-Secret": settings.n8n_webhook_secret,
            },
        )
    except httpx.HTTPError as e:
        logger.warning("n8n domain resolver request failed company=%s: %s", company_name, e)
        return None
    if r.status_code != 200:
        logger.warning(
            "n8n domain resolver non-200 company=%s status=%s", company_name, r.status_code
        )
        return None
    try:
        data = r.json()
    except Exception:
        logger.warning("n8n domain resolver returned non-JSON body company=%s", company_name)
        return None
    domain = data.get("domain")
    if not isinstance(domain, str):
        return None
    return _clean_domain_response(domain)


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
    brave_only: bool = False,
    n8n_proxy: bool = False,
) -> str | None:
    """Resolve a company name to a domain via Brave search + an LLM confirmation step.

    Three mutually-exclusive modes (default: direct LLM confirmation below):

    brave_only=True skips the fetch+LLM confirmation entirely and returns the bare
    hostname of Brave's top result, skipping past any result matching
    _NOT_A_COMPANY_SITE (Wikipedia, LinkedIn, Indeed, etc. routinely outrank a small/
    mid company's own site but are never themselves the official site - caught during
    the spot-check when "Google LLC" resolved to en.wikipedia.org). Added for D46-50's
    employer backfill when a real LLM key isn't available - see
    sponsorship_domain_backfill.py. Viable only where disambiguation is low-risk
    (well-known, unambiguous company names), not the long tail.

    n8n_proxy=True sends the Brave candidate URLs to the n8n domain-resolver webhook
    (N8N_DOMAIN_RESOLVER_WEBHOOK_URL/N8N_WEBHOOK_SECRET) instead of calling an LLM
    directly - reuses the existing n8n-hosted LLM confirmation without needing a raw
    LLM_API_KEY. Used by both the employer backfill and pipeline.py's live ingestion
    now that a direct Courier/LLM_API_KEY isn't available.

    The default LLM-confirmed path (direct OpenAI-compatible call) is untouched.
    """
    q_piece = company_name.replace(" ", "+")
    query = f"{q_piece} official website"
    async with sem_brave:
        urls = await brave_web_search(http_client, settings, query)
    if not urls:
        return None

    if brave_only:
        return _first_company_hostname(urls)

    if n8n_proxy:
        async with sem_llm:
            return await _call_n8n_domain_resolver(http_client, settings, company_name, urls)

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
