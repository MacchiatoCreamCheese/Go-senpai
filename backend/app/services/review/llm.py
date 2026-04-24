from __future__ import annotations

import json
import os
import re
from typing import Protocol


class LLMError(RuntimeError):
    pass


class LLMClient(Protocol):
    model: str

    async def generate_review(self, system: str, user: str) -> tuple[str, int]:
        """Return (raw_text, tokens_used). raw_text should be a JSON object."""
        ...


class ClaudeClient:
    def __init__(self, model: str, api_key: str, max_tokens: int = 2000) -> None:
        from anthropic import AsyncAnthropic  # lazy

        self.model = model
        self.max_tokens = max_tokens
        self._client = AsyncAnthropic(api_key=api_key)

    async def generate_review(self, system: str, user: str) -> tuple[str, int]:
        msg = await self._client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(
            block.text for block in msg.content if getattr(block, "type", None) == "text"
        )
        tokens = (msg.usage.input_tokens or 0) + (msg.usage.output_tokens or 0)
        return text, int(tokens)


class GeminiClient:
    def __init__(self, model: str, api_key: str, max_tokens: int = 2000) -> None:
        from google import genai  # lazy

        self.model = model
        self.max_tokens = max_tokens
        self._genai = genai
        self._client = genai.Client(api_key=api_key)

    async def generate_review(self, system: str, user: str) -> tuple[str, int]:
        from google.genai import types

        response = await self._client.aio.models.generate_content(
            model=self.model,
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=self.max_tokens,
                response_mime_type="application/json",
            ),
        )
        text = response.text or ""
        usage = getattr(response, "usage_metadata", None)
        tokens = 0
        if usage is not None:
            tokens = int(
                (getattr(usage, "prompt_token_count", 0) or 0)
                + (getattr(usage, "candidates_token_count", 0) or 0)
            )
        return text, tokens


def build_default_client() -> LLMClient:
    provider = os.environ.get("REVIEW_LLM_PROVIDER", "claude").lower()
    model = os.environ.get("REVIEW_LLM_MODEL")
    if provider == "claude":
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise LLMError("ANTHROPIC_API_KEY is not set")
        return ClaudeClient(model=model or "claude-haiku-4-5", api_key=api_key)
    if provider == "gemini":
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise LLMError("GOOGLE_API_KEY is not set")
        return GeminiClient(model=model or "gemini-2.5-flash", api_key=api_key)
    raise LLMError(f"unknown REVIEW_LLM_PROVIDER: {provider}")


_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def extract_json_object(raw: str) -> dict:
    """Tolerant extraction: models sometimes wrap JSON in prose or code fences."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = _JSON_OBJECT_RE.search(raw)
    if not match:
        raise LLMError(f"LLM response did not contain a JSON object: {raw[:200]}")
    return json.loads(match.group(0))
