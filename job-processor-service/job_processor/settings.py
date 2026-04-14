from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str = Field(description="Supabase project URL")
    supabase_service_role_key: str = Field(description="Supabase service role key")

    job_processor_api_keys: str = Field(
        default="",
        description="Comma-separated API keys for FastAPI (X-API-Key)",
    )

    apollo_api_key: str = Field(default="", description="Apollo.io API key")
    apollo_header_name: str = Field(default="X-Api-Key", description="Header name for Apollo auth")

    brave_search_api_key: str = Field(default="", description="Brave Search API subscription token")

    llm_base_url: str = Field(default="https://api.openai.com/v1", description="OpenAI-compatible base URL")
    llm_api_key: str = Field(default="", description="OpenAI-compatible API key")
    llm_model_filter: str = Field(default="gpt-4o-mini", description="Model for filter engine")
    llm_model_enrich: str = Field(default="gpt-4o-mini", description="Model for job enrichment")
    llm_model_domain: str = Field(default="gpt-4o-mini", description="Model for domain resolution")

    default_sponsorship_likelihood: str = Field(default="N/A")

    http_timeout_seconds: float = Field(default=60.0)
    fetch_max_bytes: int = Field(default=2_000_000)

    @field_validator("job_processor_api_keys")
    @classmethod
    def strip_keys(cls, v: str) -> str:
        return v.strip()

    def api_key_set(self) -> set[str]:
        if not self.job_processor_api_keys:
            return set()
        return {k.strip() for k in self.job_processor_api_keys.split(",") if k.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
