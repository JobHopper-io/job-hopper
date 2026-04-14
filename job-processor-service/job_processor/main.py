from __future__ import annotations


def run_api() -> None:
    import uvicorn

    uvicorn.run(
        "job_processor.api:app",
        host="0.0.0.0",
        port=8000,
        factory=False,
    )
