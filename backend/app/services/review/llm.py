from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
from collections import OrderedDict
from typing import AsyncGenerator, Awaitable, Callable, Protocol, TypeVar


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
# Backoff after each failed attempt (not before the first try).
_RETRY_DELAYS_DEFAULT = (1.0, 3.0, 8.0)  # seconds — most transient errors
_RETRY_DELAYS_RATE_LIMIT = (2.0, 6.0, 14.0, 30.0)  # 429 / quota — Google often needs longer gaps
T = TypeVar("T")


def _status_of(exc: BaseException) -> int | None:
    """Best-effort HTTP status from provider SDK exceptions (incl. nested causes)."""
    seen: set[int] = set()
    stack: list[BaseException] = [exc]
    if exc.__cause__ is not None:
        stack.append(exc.__cause__)
    if exc.__context__ is not None and exc.__context__ is not exc.__cause__:
        stack.append(exc.__context__)

    for e in stack:
        eid = id(e)
        if eid in seen:
            continue
        seen.add(eid)
        for attr in ("status_code", "status", "http_status"):
            v = getattr(e, attr, None)
            if isinstance(v, int) and 100 <= v <= 599:
                return v
        code = getattr(e, "code", None)
        if isinstance(code, int) and 100 <= code <= 599:
            return code

    blob = f"{exc!s} {type(exc).__name__}".upper()
    if "429" in blob or "RESOURCE_EXHAUSTED" in blob or "TOO MANY REQUESTS" in blob:
        return 429
    return None


def _retry_delay_queue(first_status: int | None) -> list[float]:
    if first_status == 429:
        return list(_RETRY_DELAYS_RATE_LIMIT)
    return list(_RETRY_DELAYS_DEFAULT)


def _transient_exhausted_message(label: str, status: int | None) -> str:
    if status == 429:
        return (
            f"{label} hit the API rate limit (HTTP 429) after several retries. "
            "Free tiers are strict: wait a few minutes, reduce how often you generate reviews, "
            "or use a paid key / different model in Google AI Studio. "
            "You can also set REVIEW_LLM_PROVIDER=claude if you have Anthropic credits."
        )
    return (
        f"{label} provider is unavailable after retries "
        f"(status={status}). Please try again in a minute."
    )


async def _with_retry(
    call: Callable[[], Awaitable[T]],
    label: str,
) -> T:
    """Retry transient provider errors with backoff; longer waits for HTTP 429."""
    pending_delays: list[float] | None = None
    first_transient_status: int | None = None
    while True:
        try:
            return await call()
        except LLMError:
            raise
        except Exception as exc:
            status = _status_of(exc)
            transient = status in _TRANSIENT_STATUSES or "UNAVAILABLE" in str(exc).upper()
            if not transient:
                raise LLMError(f"{label} call failed: {exc}") from exc

            if pending_delays is None:
                first_transient_status = status
                pending_delays = _retry_delay_queue(status)

            if not pending_delays:
                raise LLMError(_transient_exhausted_message(label, first_transient_status)) from exc

            delay = pending_delays.pop(0)
            log.warning(
                "%s transient error (status=%s); sleeping %.1fs before retry (%d more backoff(s) if needed): %s",
                label,
                status,
                delay,
                len(pending_delays),
                exc,
            )
            await asyncio.sleep(delay)


class LLMClient(Protocol):
    model: str

    async def generate_review(self, system: str, user: str) -> tuple[str, int]:
        """Return (raw_text, tokens_used). raw_text should be a JSON object."""
        ...

    async def stream_generate(self, system: str, user: str) -> AsyncGenerator[str, None]:
        """Yield text tokens as they arrive from the LLM."""
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


    async def stream_generate(self, system: str, user: str) -> AsyncGenerator[str, None]:
        async with self._client.messages.stream(
            model=self.model,
            max_tokens=400,
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            async for text in stream.text_stream:
                yield text


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


    async def stream_generate(self, system: str, user: str) -> AsyncGenerator[str, None]:
        text, _ = await self.generate_review(system, user)
        yield text


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
