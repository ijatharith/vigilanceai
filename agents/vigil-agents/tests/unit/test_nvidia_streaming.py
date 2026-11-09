"""Local change (Vigilance): NVIDIA streaming + reasoning settings in the adapter."""

import json

import httpx
import pytest

from vigil.llm.adapter import OpenAICompatibleAdapter, ProviderInferenceError, assemble_stream
from vigil.llm.provider_registry import get_provider


def sse(*chunks):
    return "".join(f"data: {json.dumps(c)}\n\n" for c in chunks) + "data: [DONE]\n\n"


def test_assemble_stream_discards_reasoning_and_joins_tool_call_fragments():
    lines = sse(
        {"choices": [{"delta": {"reasoning_content": "secret chain of thought"}}]},
        {"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "c1", "function": {"name": "search_", "arguments": '{"ip": '}}]}}]},
        {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"name": "events", "arguments": '"192.0.2.10"}'}}]}}]},
        {"choices": [{"delta": {"content": "done"}}]},
    ).splitlines()
    msg = assemble_stream(lines)
    assert msg["content"] == "done"
    assert msg["tool_calls"] == [{"id": "c1", "type": "function", "function": {"name": "search_events", "arguments": '{"ip": "192.0.2.10"}'}}]
    assert "secret" not in json.dumps(msg)


@pytest.mark.asyncio
async def test_nvidia_request_streams_with_thinking_settings(monkeypatch):
    monkeypatch.delenv("VIGIL_NVIDIA_THINKING", raising=False)
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, text=sse({"choices": [{"delta": {"content": "ok"}}]}), headers={"content-type": "text/event-stream"})

    adapter = OpenAICompatibleAdapter(get_provider("nvidia"), "nvidia/nemotron-3-ultra-550b-a55b", "k", transport=httpx.MockTransport(handler))
    msg = await adapter.complete(messages=[{"role": "user", "content": "hi"}], tools=[])
    assert msg["content"] == "ok"
    assert seen["stream"] is True
    assert seen["chat_template_kwargs"] == {"enable_thinking": True}
    assert seen["temperature"] == 1.0 and seen["top_p"] == 0.95 and seen["max_tokens"] == 16384


@pytest.mark.asyncio
async def test_nvidia_auth_failure_is_safe():
    transport = httpx.MockTransport(lambda r: httpx.Response(401, text="nope"))
    adapter = OpenAICompatibleAdapter(get_provider("nvidia"), "m", "secret-key", transport=transport)
    with pytest.raises(ProviderInferenceError) as err:
        await adapter.complete(messages=[{"role": "user", "content": "hi"}], tools=[])
    assert "secret-key" not in str(err.value)
