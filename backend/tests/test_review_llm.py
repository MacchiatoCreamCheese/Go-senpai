import pytest

from unittest.mock import patch

from app.services.review.llm import LLMError, build_default_client, extract_json_object


def test_extract_plain_json():
    out = extract_json_object('{"summary_md": "hi", "moments": []}')
    assert out["summary_md"] == "hi"


def test_extract_json_from_code_fence():
    raw = "Sure!\n```json\n{\"summary_md\": \"x\", \"moments\": []}\n```"
    out = extract_json_object(raw)
    assert out["summary_md"] == "x"


def test_extract_raises_when_no_json():
    with pytest.raises(LLMError):
        extract_json_object("no json here")


def test_extract_json_after_prose_prefix():
    raw = 'Here you go:\n{"summary_md": "x", "moments": []}'
    out = extract_json_object(raw)
    assert out["summary_md"] == "x"


def test_extract_truncated_json_raises_truncation_hint():
    raw = '{"summary_md": "This game featured some strong play'
    with pytest.raises(LLMError) as exc_info:
        extract_json_object(raw)
    assert "truncat" in str(exc_info.value).lower() or "never closed" in str(exc_info.value).lower()


def test_build_default_client_unknown_provider_raises():
    with patch.dict("os.environ", {"REVIEW_LLM_PROVIDER": "bogus"}, clear=False):
        with pytest.raises(LLMError):
            build_default_client()


def test_build_default_client_claude_requires_anthropic_key():
    env = {"REVIEW_LLM_PROVIDER": "claude", "ANTHROPIC_API_KEY": ""}
    with patch.dict("os.environ", env, clear=False):
        with pytest.raises(LLMError):
            build_default_client()


def test_build_default_client_gemini_requires_google_key():
    env = {"REVIEW_LLM_PROVIDER": "gemini", "GOOGLE_API_KEY": ""}
    with patch.dict("os.environ", env, clear=False):
        with pytest.raises(LLMError):
            build_default_client()


import asyncio
from unittest.mock import AsyncMock

from app.services.review.llm import _with_retry


class _FakeStatusError(Exception):
    def __init__(self, status_code: int, msg: str = "boom") -> None:
        super().__init__(msg)
        self.status_code = status_code


def test_with_retry_returns_on_success_first_try():
    call = AsyncMock(return_value=("ok", 10))
    result = asyncio.run(_with_retry(call, label="Test"))
    assert result == ("ok", 10)
    assert call.await_count == 1


def test_with_retry_retries_transient_503_then_succeeds():
    calls = AsyncMock(side_effect=[_FakeStatusError(503), ("ok", 5)])
    with patch("app.services.review.llm.asyncio.sleep", new=AsyncMock(return_value=None)):
        result = asyncio.run(_with_retry(calls, label="Test"))
    assert result == ("ok", 5)
    assert calls.await_count == 2


def test_with_retry_gives_up_after_transient_exhaustion():
    calls = AsyncMock(side_effect=[_FakeStatusError(503)] * 4)
    with patch("app.services.review.llm.asyncio.sleep", new=AsyncMock(return_value=None)):
        with pytest.raises(LLMError) as exc_info:
            asyncio.run(_with_retry(calls, label="Test"))
    assert "unavailable" in str(exc_info.value).lower()
    assert calls.await_count == 4  # initial try + 3 backoffs


def test_with_retry_429_exhaustion_message_mentions_rate_limit():
    calls = AsyncMock(side_effect=[_FakeStatusError(429)] * 5)
    with patch("app.services.review.llm.asyncio.sleep", new=AsyncMock(return_value=None)):
        with pytest.raises(LLMError) as exc_info:
            asyncio.run(_with_retry(calls, label="Gemini"))
    assert "429" in str(exc_info.value) or "rate limit" in str(exc_info.value).lower()
    assert calls.await_count == 5  # initial + 4 backoffs for 429


def test_with_retry_does_not_retry_non_transient():
    calls = AsyncMock(side_effect=[_FakeStatusError(400, "bad request")])
    with pytest.raises(LLMError) as exc_info:
        asyncio.run(_with_retry(calls, label="Test"))
    assert calls.await_count == 1
    assert "failed" in str(exc_info.value).lower()
