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
