from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException

from job_processor.settings import get_settings


async def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> None:
    keys = get_settings().api_key_set()
    if not keys:
        raise HTTPException(
            status_code=500,
            detail="Server misconfiguration: JOB_PROCESSOR_API_KEYS is empty",
        )
    if not x_api_key or x_api_key.strip() not in keys:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")
