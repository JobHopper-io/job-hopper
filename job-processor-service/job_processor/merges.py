from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable


def dedupe_by_key(rows: list[dict[str, Any]], key_fields: list[str]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        key = tuple(row.get(f) for f in key_fields)
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def anti_join_company_name(
    candidates: list[dict[str, Any]],
    existing: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    blocked = {r.get("company_name") for r in existing if r.get("company_name")}
    return [c for c in candidates if c.get("company_name") not in blocked]


def anti_join_bd_leads(
    candidates: list[dict[str, Any]],
    bd_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    blocked = {r.get("company_name") for r in bd_rows if r.get("company_name")}
    return [c for c in candidates if c.get("company_name") not in blocked]


def _parse_date(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        s = value.replace("Z", "+00:00")
        try:
            d = datetime.fromisoformat(s)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def anti_join_live_jobs(
    candidates: list[dict[str, Any]],
    live_rows: list[dict[str, Any]],
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Mirror n8n merge SQL for Filter out live jobs."""
    now = now or datetime.now(tz=timezone.utc)

    def is_blocked(candidate: dict[str, Any]) -> bool:
        c_name = candidate.get("company_name")
        c_title = candidate.get("job_title")
        c_posted = _parse_date(candidate.get("posted_date")) or now
        c_apply = candidate.get("apply_link")

        for live in live_rows:
            if live.get("company_name") != c_name:
                continue
            if live.get("job_title") != c_title:
                continue
            live_posted = _parse_date(live.get("posted_date"))
            live_created = _parse_date(live.get("created_at"))
            live_ref = live_posted or live_created or now
            days = abs((c_posted - live_ref).days)
            if days < 30:
                return True
            if c_apply and live.get("apply_link") == c_apply:
                return True
        return False

    return [c for c in candidates if not is_blocked(c)]


def normalize_filter_token(raw: str) -> str:
    t = (raw or "").strip().lower().strip("`\"'")
    if "exclusion_lists" in t or t == "exclusion_list":
        return "exclusion_lists"
    if "bd_leads" in t or "bd leads" in t:
        return "bd_leads"
    if "job_hopper_live" in t or "job_hopper" in t:
        return "job_hopper_live"
    return "job_hopper_live"
