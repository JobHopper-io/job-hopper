from __future__ import annotations

from openai import AsyncOpenAI

from job_processor.settings import Settings


def openai_client(settings: Settings) -> AsyncOpenAI:
    return AsyncOpenAI(
        base_url=settings.llm_base_url.rstrip("/"),
        api_key=settings.llm_api_key or "unused",
    )


async def chat_text(
    client: AsyncOpenAI,
    model: str,
    system: str,
    user: str,
) -> str:
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
    )
    choice = resp.choices[0]
    content = choice.message.content
    return (content or "").strip()
