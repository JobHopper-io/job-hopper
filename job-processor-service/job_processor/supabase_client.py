from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

import httpx

from job_processor.settings import Settings


class SupabaseRestError(RuntimeError):
    pass


class SupabaseRest:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self._settings = settings
        base = settings.supabase_url.rstrip("/")
        self._rest = f"{base}/rest/v1"
        self._key = settings.supabase_service_role_key
        self._client = client

    def _headers(self, *, prefer: str | None = None) -> dict[str, str]:
        h = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
        }
        if prefer:
            h["Prefer"] = prefer
        return h

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: list[tuple[str, str]] | None = None,
        json_body: Any = None,
        prefer: str | None = "return=representation",
    ) -> Any:
        url = f"{self._rest}{path}"
        req_kw: dict[str, Any] = {}
        if method != "GET" and json_body is not None:
            req_kw["json"] = json_body
        r = await self._client.request(
            method,
            url,
            headers=self._headers(prefer=prefer),
            params=params,
            **req_kw,
        )
        if r.status_code >= 400:
            raise SupabaseRestError(f"{method} {path} {r.status_code}: {r.text}")
        if r.status_code == 204 or not r.content:
            return None
        return r.json()

    async def claim_scraper_raw_jobs(self, p_limit: int) -> list[dict[str, Any]]:
        data = await self._request(
            "POST",
            "/rpc/claim_scraper_raw_jobs",
            json_body={"p_limit": p_limit},
            prefer="return=representation",
        )
        if data is None:
            return []
        return data if isinstance(data, list) else [data]

    async def get_processor_flags(self) -> dict[str, Any]:
        rows = await self._request(
            "GET",
            "/job_processor_flags",
            params=[("id", "eq.1"), ("select", "*")],
        )
        if not rows:
            return {"apollo_credits_exhausted": False}
        return rows[0]

    async def set_apollo_credits_exhausted(self, value: bool, dry_run: bool) -> None:
        if dry_run:
            return
        await self._request(
            "PATCH",
            "/job_processor_flags",
            params=[("id", "eq.1")],
            json_body={
                "apollo_credits_exhausted": value,
                "updated_at": datetime.now(tz=timezone.utc).isoformat(),
            },
            prefer="return=minimal",
        )

    async def try_consume_apollo_credits(self, name: str, amount: int, *, dry_run: bool) -> dict[str, Any]:
        """Calls public.try_consume_apollo_credits RPC. Returns {ok, usage_after, credit_limit}."""
        if dry_run:
            return {"ok": True, "usage_after": 0, "credit_limit": 999999}
        data = await self._request(
            "POST",
            "/rpc/try_consume_apollo_credits",
            json_body={"p_name": name, "p_amount": amount},
            prefer="return=representation",
        )
        if not data:
            return {"ok": False, "usage_after": 0, "credit_limit": 0}
        row = data[0] if isinstance(data, list) else data
        if not isinstance(row, dict):
            return {"ok": False, "usage_after": 0, "credit_limit": 0}
        return {
            "ok": bool(row.get("ok")),
            "usage_after": int(row.get("usage_after") or 0),
            "credit_limit": int(row.get("credit_limit") or 0),
        }

    async def refund_apollo_credits(self, name: str, amount: int, *, dry_run: bool) -> None:
        if dry_run:
            return
        await self._request(
            "POST",
            "/rpc/refund_apollo_credits",
            json_body={"p_name": name, "p_amount": amount},
            prefer="return=minimal",
        )

    async def insert_run(
        self,
        *,
        status: str,
        options: dict[str, Any],
        counts: dict[str, Any] | None = None,
    ) -> str:
        body = {
            "status": status,
            "options": options,
            "counts": counts or {},
        }
        rows = await self._request("POST", "/job_processor_runs", json_body=body)
        if not rows or not isinstance(rows, list):
            raise SupabaseRestError("insert_run: unexpected response")
        return str(rows[0]["id"])

    async def update_run(
        self,
        run_id: str,
        *,
        status: str | None = None,
        counts: dict[str, Any] | None = None,
        error_message: str | None = None,
        started_at: str | None = None,
        finished_at: str | None = None,
    ) -> None:
        body: dict[str, Any] = {"updated_at": datetime.now(tz=timezone.utc).isoformat()}
        if status is not None:
            body["status"] = status
        if counts is not None:
            body["counts"] = counts
        if error_message is not None:
            body["error_message"] = error_message
        if started_at is not None:
            body["started_at"] = started_at
        if finished_at is not None:
            body["finished_at"] = finished_at
        await self._request(
            "PATCH",
            "/job_processor_runs",
            params=[("id", f"eq.{run_id}")],
            json_body=body,
            prefer="return=minimal",
        )

    async def get_run(self, run_id: str) -> dict[str, Any] | None:
        rows = await self._request(
            "GET",
            "/job_processor_runs",
            params=[("id", f"eq.{run_id}"), ("select", "*")],
        )
        if not rows:
            return None
        return rows[0]

    async def fetch_all_table(self, table: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        offset = 0
        page = 1000
        while True:
            rows = await self._request(
                "GET",
                f"/{table}",
                params=[
                    ("select", "*"),
                    ("limit", str(page)),
                    ("offset", str(offset)),
                ],
                prefer=None,
            )
            if not rows:
                break
            out.extend(rows)
            if len(rows) < page:
                break
            offset += page
        return out

    async def update_raw_job_status(
        self,
        job_id: str,
        status: Literal["pending", "processing", "processed"],
        *,
        dry_run: bool,
    ) -> None:
        if dry_run:
            return
        await self._request(
            "PATCH",
            "/scraper_raw_jobs",
            params=[("id", f"eq.{job_id}")],
            json_body={"status": status},
            prefer="return=minimal",
        )

    async def insert_job_hopper_live(self, row: dict[str, Any], *, dry_run: bool) -> None:
        if dry_run:
            return
        await self._request("POST", "/job_hopper_live", json_body=row, prefer="return=minimal")

    async def insert_exclusion_list(self, company_name: str, *, dry_run: bool) -> None:
        if dry_run:
            return
        await self._request(
            "POST",
            "/exclusion_lists",
            json_body={"company_name": company_name},
            prefer="return=minimal",
        )

    async def count_rows(
        self, table: str, *, params: list[tuple[str, str]] | None = None, select: str = "id"
    ) -> int:
        """Exact row count via limit=0 + Prefer: count=exact - fetches no rows, just the
        Content-Range total. Used for dry-run reporting (show what a write WOULD affect without
        doing it) and post-apply verification (e.g. counting orphans). `select` defaults to "id"
        but must be overridden for tables with no `id` column (e.g. employer_sponsorship_scores,
        whose primary key is employer_id)."""
        query = [("select", select), ("limit", "0")] + list(params or [])
        r = await self._client.request(
            "GET",
            f"{self._rest}/{table}",
            headers=self._headers(prefer="count=exact"),
            params=query,
        )
        if r.status_code >= 400:
            raise SupabaseRestError(f"GET /{table} {r.status_code}: {r.text}")
        content_range = r.headers.get("content-range", "")
        if "/" in content_range:
            total = content_range.rsplit("/", 1)[-1]
            if total.isdigit():
                return int(total)
        return 0

    async def select(
        self,
        table: str,
        *,
        select: str = "*",
        params: list[tuple[str, str]] | None = None,
    ) -> list[dict[str, Any]]:
        """Single-page read. Callers paginate; PostgREST caps responses at 1000 rows regardless
        of a larger `limit`, so pass limit<=1000 and page with offset (see fetch_all_table)."""
        query = [("select", select)] + list(params or [])
        rows = await self._request("GET", f"/{table}", params=query, prefer=None)
        if not rows:
            return []
        return rows if isinstance(rows, list) else [rows]

    async def insert_rows(
        self,
        table: str,
        rows: list[dict[str, Any]],
        *,
        dry_run: bool,
        chunk_size: int = 500,
    ) -> int:
        """Plain batch insert, chunked. Returns rows sent. Use upsert_rows when the table has a
        conflict target; this is for tables with no natural key (e.g. employers)."""
        if dry_run or not rows:
            return 0
        sent = 0
        for i in range(0, len(rows), chunk_size):
            chunk = rows[i : i + chunk_size]
            await self._request("POST", f"/{table}", json_body=chunk, prefer="return=minimal")
            sent += len(chunk)
        return sent

    async def patch_rows(
        self,
        table: str,
        patch: dict[str, Any],
        *,
        params: list[tuple[str, str]],
        dry_run: bool,
    ) -> int:
        """PATCH matching rows. Returns the number actually updated (via Prefer: count=exact),
        not the number requested - so callers can verify coverage rather than assume it."""
        if dry_run:
            return 0
        url = f"{self._rest}/{table}"
        r = await self._client.request(
            "PATCH",
            url,
            headers=self._headers(prefer="return=minimal,count=exact"),
            params=params,
            json=patch,
        )
        if r.status_code >= 400:
            raise SupabaseRestError(f"PATCH /{table} {r.status_code}: {r.text}")
        content_range = r.headers.get("content-range", "")
        if "/" in content_range:
            total = content_range.rsplit("/", 1)[-1]
            if total.isdigit():
                return int(total)
        return 0

    async def delete_rows(
        self,
        table: str,
        *,
        params: list[tuple[str, str]],
        dry_run: bool,
    ) -> int:
        """DELETE matching rows. Returns the number deleted. `params` is required - PostgREST
        would happily delete the whole table without a filter."""
        if dry_run:
            return 0
        if not params:
            raise ValueError("delete_rows requires a filter")
        r = await self._client.request(
            "DELETE",
            f"{self._rest}/{table}",
            headers=self._headers(prefer="return=minimal,count=exact"),
            params=params,
        )
        if r.status_code >= 400:
            raise SupabaseRestError(f"DELETE /{table} {r.status_code}: {r.text}")
        content_range = r.headers.get("content-range", "")
        if "/" in content_range:
            total = content_range.rsplit("/", 1)[-1]
            if total.isdigit():
                return int(total)
        return 0

    async def upsert_rows(
        self,
        table: str,
        rows: list[dict[str, Any]],
        *,
        on_conflict: str,
        dry_run: bool,
        chunk_size: int = 500,
    ) -> int:
        """Batch upsert (POST + Prefer: resolution=merge-duplicates), chunked. Returns rows sent.

        Note: `on_conflict` cannot target a PARTIAL unique index (PostgreSQL needs the index's
        WHERE predicate in the statement and PostgREST does not emit it). For tables whose only
        unique index is partial, use insert_rows and handle idempotency in the caller.
        """
        if dry_run or not rows:
            return 0
        sent = 0
        for i in range(0, len(rows), chunk_size):
            chunk = rows[i : i + chunk_size]
            await self._request(
                "POST",
                f"/{table}",
                params=[("on_conflict", on_conflict)],
                json_body=chunk,
                prefer="resolution=merge-duplicates,return=minimal",
            )
            sent += len(chunk)
        return sent

    async def insert_bd_lead(self, company_name: str, status: str, *, dry_run: bool) -> None:
        if dry_run:
            return
        await self._request(
            "POST",
            "/bd_leads",
            json_body={"company_name": company_name, "status": status},
            prefer="return=minimal",
        )
