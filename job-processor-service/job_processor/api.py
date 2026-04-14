from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from job_processor.deps import verify_api_key
from job_processor.models import (
    CreateRunRequest,
    RunResponse,
    RunStatusResponse,
    SyncRunRequest,
    SyncRunResponse,
)
from job_processor.pipeline import run_pipeline, run_pipeline_sync_same_process
from job_processor.settings import get_settings
from job_processor.supabase_client import SupabaseRest, SupabaseRestError

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    app.state.http = httpx.AsyncClient(timeout=httpx.Timeout(settings.http_timeout_seconds))
    yield
    await app.state.http.aclose()


async def _run_pipeline_background(app: FastAPI, run_id: str) -> None:
    settings = get_settings()
    client: httpx.AsyncClient = app.state.http
    try:
        await run_pipeline(run_id, settings, client)
    except Exception:
        logger.exception("background pipeline failed run_id=%s", run_id)


app = FastAPI(
    title="Job processor",
    description=(
        "FastAPI port of n8n job-processor workflows. Use X-API-Key for auth. "
        "POST /v1/runs starts work in the background (same process; poll GET /v1/runs/{id})."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/runs", dependencies=[Depends(verify_api_key)], response_model=RunResponse)
async def create_run(request: Request, body: CreateRunRequest) -> RunResponse:
    settings = get_settings()
    db = SupabaseRest(settings, request.app.state.http)
    try:
        run_id = await db.insert_run(
            status="queued",
            options=body.model_dump(),
            counts={},
        )
    except SupabaseRestError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    asyncio.create_task(_run_pipeline_background(request.app, run_id))
    return RunResponse(run_id=run_id, status="queued")


@app.get(
    "/v1/runs/{run_id}",
    dependencies=[Depends(verify_api_key)],
    response_model=RunStatusResponse,
)
async def get_run(run_id: str, request: Request) -> RunStatusResponse:
    settings = get_settings()
    db = SupabaseRest(settings, request.app.state.http)
    row = await db.get_run(run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    return _row_to_status(row)


@app.post(
    "/v1/runs/sync",
    dependencies=[Depends(verify_api_key)],
    response_model=SyncRunResponse,
)
async def create_run_sync(body: SyncRunRequest, request: Request) -> SyncRunResponse:
    """Run the pipeline inline (blocks). Suitable only for small limits."""
    settings = get_settings()
    db = SupabaseRest(settings, request.app.state.http)
    try:
        run_id = await db.insert_run(
            status="queued",
            options=body.model_dump(),
            counts={},
        )
        counts = await run_pipeline_sync_same_process(run_id, settings)
        row = await db.get_run(run_id)
        st = str(row.get("status")) if row else "unknown"
        return SyncRunResponse(
            run_id=run_id,
            status=st,
            counts=counts,
            error_message=row.get("error_message") if row else None,
        )
    except SupabaseRestError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


def _row_to_status(row: dict[str, Any]) -> RunStatusResponse:
    return RunStatusResponse(
        id=str(row["id"]),
        status=str(row["status"]),
        options=dict(row.get("options") or {}),
        counts=dict(row.get("counts") or {}),
        error_message=row.get("error_message"),
        created_at=row.get("created_at"),
        started_at=row.get("started_at"),
        finished_at=row.get("finished_at"),
        updated_at=row.get("updated_at"),
    )
