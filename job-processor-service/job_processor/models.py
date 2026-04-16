from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class RunOptions(BaseModel):
    limit: int = Field(default=50, ge=1, le=5000, description="Max raw jobs to claim for this run")
    status_filter: Literal["pending"] = "pending"
    batch_size: int = Field(default=25, ge=1, le=500, description="Rows per claim_scraper_raw_jobs call")
    max_concurrent_llm: int = Field(default=4, ge=1, le=64)
    max_concurrent_apollo: int = Field(default=4, ge=1, le=64)
    max_concurrent_brave: int = Field(default=2, ge=1, le=32)
    max_concurrent_fetch: int = Field(default=8, ge=1, le=64)
    max_concurrent_jobs: int = Field(
        default=8,
        ge=1,
        le=64,
        description="How many raw jobs to process in parallel (LLM/Apollo limits still apply)",
    )
    skip_domain_resolution: bool = False
    skip_apollo: bool = False
    skip_enrichment: bool = False
    force_clear_apollo_limit: bool = False
    dry_run: bool = False
    model_filter: Optional[str] = None
    model_enrich: Optional[str] = None
    model_domain: Optional[str] = None


class CreateRunRequest(RunOptions):
    pass


class RunResponse(BaseModel):
    run_id: str
    status: str


class RunStatusResponse(BaseModel):
    id: str
    status: str
    options: dict[str, Any]
    counts: dict[str, Any]
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    updated_at: Optional[str] = None


class SyncRunRequest(RunOptions):
    pass


class SyncRunResponse(BaseModel):
    run_id: str
    status: str
    counts: dict[str, Any]
    error_message: Optional[str] = None
