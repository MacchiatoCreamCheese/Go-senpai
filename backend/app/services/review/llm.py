from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
from collections import OrderedDict
from typing import Awaitable, Callable, Protocol, TypeVar


log = logging.getLogger(__name__)


_LLM_CACHE_MAX = 64
_llm_cache: "OrderedDict[str, tuple[str, int]]" = OrderedDict()


def _cache_key(model: str, system: str, user: str) -> str:
    h = hashlib.sha256()
    h.update(model.encode())
    h.update(b"\0")
    h.update(system.encode())
    h.update(b"\0")
    h.update(user.encode())
    return h.hexdigest()


def _cache_get(key: str) -> tuple[str, int] | None:
    val = _llm_cache.get(key)
    if val is not None:
        _llm_cache.move_to_end(key)
    return val


def _cache_put(key: str, value: tuple[str, int]) -> None:
    _llm_cache[key] = value
    _llm_cache.move_to_end(key)
    while len(_llm_cache) > _LLM_CACHE_MAX:
        _llm_cache.popitem(last=False)


class LLMError(RuntimeError):
    pass


_TRANSIENT_STATUSES = {408, 425, 429, 500, 502, 503, 504}
_RETRY_DELAYS = (1.0, 3.0)  # seconds
T = TypeVar("T")


def _status_of(exc: BaseException) -> int | None:
    code = getattr(exc, "status_code", None)
    if isinstance(code, int):
        return code
    code = getattr(exc, "code", None)
    return code if isinstance(code, int) else None


async def _with_retry(
    call: Callable[[], Awaitable[T]],
    label: str,
) -> T:
    """Retry transient provider errors with short backoff; map others to LLMError."""
    for attempt, delay in enumerate((*_RETRY_DELAYS, None)):
        try:
            return await call()
        except LLMError:
            raise
        except Exception as exc:
            status = _status_of(exc)
            transient = status in _TRANSIENT_STATUSES or "UNAVAILABLE" in str(exc).upper()
            if transient and delay is not None:
                log.warning(
                    "%s transient error (status=%s, attempt=%d); retrying in %.1fs: %s",
                    label, status, attempt + 1, delay, exc,
                )
                await asyncio.sleep(delay)
                continue
            if transient:
                raise LLMError(
                    f"{label} provider is unavailable after retries "
                    f"(status={status}). Please try again in a minute."
                ) from exc
            raise LLMError(f"{label} call failed: {exc}") from exc
    raise LLMError(f"{label} retries exhausted")


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
        key = _cache_key(self.model, system, user)
        hit = _cache_get(key)
        if hit is not None:
            return hit

        async def call() -> tuple[str, int]:
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

        result = await _with_retry(call, label="Claude")
        _cache_put(key, result)
        return result


class GeminiClient:
    def __init__(self, model: str, api_key: str, max_tokens: int = 2000) -> None:
        from google import genai  # lazy

        self.model = model
        self.max_tokens = max_tokens
        self._genai = genai
        self._client = genai.Client(api_key=api_key)

    async def generate_review(self, system: str, user: str) -> tuple[str, int]:
        from google.genai import types

        key = _cache_key(self.model, system, user)
        hit = _cache_get(key)
        if hit is not None:
            return hit

        async def call() -> tuple[str, int]:
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

        result = await _with_retry(call, label="Gemini")
        _cache_put(key, result)
        return result


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
