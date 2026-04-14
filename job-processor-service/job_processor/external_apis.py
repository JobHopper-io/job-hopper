from __future__ import annotations

from typing import Any

import httpx

from job_processor.settings import Settings


async def brave_web_search(
    client: httpx.AsyncClient,
    settings: Settings,
    query: str,
) -> list[str]:
    if not settings.brave_search_api_key:
        return []
    url = "https://api.search.brave.com/res/v1/web/search"
    r = await client.get(
        url,
        params={"q": query, "count": 20},
        headers={
            "X-Subscription-Token": settings.brave_search_api_key,
            "Accept": "application/json",
        },
    )
    if r.status_code >= 400:
        return []
    data = r.json()
    web = data.get("web") or {}
    results = web.get("results") or []
    urls: list[str] = []
    for item in results:
        u = item.get("url")
        if u and isinstance(u, str):
            urls.append(u)
    return list(dict.fromkeys(urls))


async def fetch_url_text(
    client: httpx.AsyncClient,
    settings: Settings,
    page_url: str,
) -> str:
    try:
        async with client.stream("GET", page_url, follow_redirects=True) as r:
            if r.status_code >= 400:
                return ""
            total = 0
            chunks: list[bytes] = []
            async for chunk in r.aiter_bytes():
                total += len(chunk)
                if total > settings.fetch_max_bytes:
                    break
                chunks.append(chunk)
        raw = b"".join(chunks)
        return raw.decode("utf-8", errors="replace")
    except httpx.HTTPError:
        return ""


async def apollo_organization_enrich(
    client: httpx.AsyncClient,
    settings: Settings,
    domain: str,
) -> tuple[dict[str, Any] | None, bool]:
    """
    Returns (response_json_or_none, is_credit_or_quota_error).
    """
    if not settings.apollo_api_key:
        return None, False
    url = "https://api.apollo.io/api/v1/organizations/enrich"
    headers = {settings.apollo_header_name: settings.apollo_api_key}
    r = await client.get(url, params={"domain": domain}, headers=headers)
    if r.status_code == 200:
        try:
            return r.json(), False
        except Exception:
            return None, False
    if r.status_code in (401, 402, 403, 429) or "credit" in r.text.lower():
        return None, True
    return None, False
