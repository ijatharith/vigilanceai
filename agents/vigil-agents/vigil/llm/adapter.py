from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import httpx

from vigil.llm.provider_registry import ProviderDefinition


class ProviderInferenceError(RuntimeError):
    pass


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


def _env_number(name: str, default: float, cast=float):
    try:
        return cast(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def nvidia_generation_settings() -> dict[str, Any]:
    """NVIDIA NIM sampling/reasoning settings (Nemotron recommended defaults).

    Overridable via VIGIL_NVIDIA_THINKING, VIGIL_NVIDIA_TEMPERATURE,
    VIGIL_NVIDIA_TOP_P and VIGIL_NVIDIA_MAX_TOKENS.
    """
    return {
        "temperature": _env_number("VIGIL_NVIDIA_TEMPERATURE", 1.0),
        "top_p": _env_number("VIGIL_NVIDIA_TOP_P", 0.95),
        "max_tokens": max(256, min(_env_number("VIGIL_NVIDIA_MAX_TOKENS", 16384, int), 65536)),
        "chat_template_kwargs": {"enable_thinking": _env_flag("VIGIL_NVIDIA_THINKING", True)},
    }


def assemble_stream(lines: list[str]) -> dict[str, Any]:
    """Rebuild one assistant message from OpenAI-style SSE chunks.

    `reasoning_content` deltas are deliberately DISCARDED: the model's private
    reasoning is never returned to the runtime, stored, or shown to analysts.
    """
    content: list[str] = []
    calls: dict[int, dict[str, Any]] = {}
    for line in lines:
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data or data == "[DONE]":
            continue
        chunk = json.loads(data)
        if not isinstance(chunk, dict) or chunk.get("error"):
            raise ProviderInferenceError("provider reported an error mid-stream")
        for choice in chunk.get("choices") or []:
            delta = choice.get("delta") or {}
            if isinstance(delta.get("content"), str):
                content.append(delta["content"])
            for tc in delta.get("tool_calls") or []:
                slot = calls.setdefault(int(tc.get("index", len(calls))), {"id": None, "type": "function", "function": {"name": "", "arguments": ""}})
                if tc.get("id"):
                    slot["id"] = tc["id"]
                fn = tc.get("function") or {}
                if fn.get("name"):
                    slot["function"]["name"] += fn["name"]
                if fn.get("arguments"):
                    slot["function"]["arguments"] += fn["arguments"]
    message: dict[str, Any] = {"role": "assistant", "content": "".join(content) or None}
    if calls:
        message["tool_calls"] = [
            {**c, "id": c["id"] or f"call_{i}"} for i, c in sorted(calls.items())
        ]
    return message


class OpenAICompatibleAdapter:
    """OpenAI-compatible chat adapter. Tool execution remains inside VIGIL."""

    def __init__(self, provider: ProviderDefinition, model_id: str, api_key: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.provider = provider
        self.model_id = model_id
        self.api_key = api_key
        self.transport = transport

    async def complete(self, *, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        body: dict[str, Any] = {"model": self.model_id, "messages": messages}
        if tools:
            body.update({"tools": tools, "tool_choice": "auto"})
        if self.provider.provider_id == "nvidia":
            body.update(nvidia_generation_settings())
            return await self._complete_streaming(body)
        if self.provider.provider_id != "deepseek":
            body["temperature"] = 0
        try:
            async with httpx.AsyncClient(
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=httpx.Timeout(45, connect=8), transport=self.transport,
                follow_redirects=False,
            ) as client:
                response = await client.post(f"{self.provider.base_url.rstrip('/')}{self.provider.chat_path}", json=body)
                if response.status_code in (401, 403):
                    raise ProviderInferenceError("provider rejected the configured credential or model access")
                if response.status_code == 429:
                    raise ProviderInferenceError("provider rate limit reached")
                if 300 <= response.status_code < 400:
                    raise ProviderInferenceError("provider redirect was refused")
                if response.status_code >= 500:
                    raise ProviderInferenceError(f"provider service unavailable ({response.status_code})")
                response.raise_for_status()
                message = response.json()["choices"][0]["message"]
                if not isinstance(message, dict):
                    raise ValueError("assistant message is not an object")
                return message
        except ProviderInferenceError:
            raise
        except httpx.TimeoutException as exc:
            raise ProviderInferenceError("provider inference timed out") from exc
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise ProviderInferenceError(f"provider inference failed: {type(exc).__name__}") from exc

    async def _complete_streaming(self, body: dict[str, Any]) -> dict[str, Any]:
        """Stream the response so slow reasoning models don't hit a single read timeout.

        Bounds: VIGIL_LLM_IDLE_TIMEOUT seconds between chunks (default 120) and
        VIGIL_LLM_TOTAL_TIMEOUT seconds overall (default 600).
        """
        idle = max(10.0, min(_env_number("VIGIL_LLM_IDLE_TIMEOUT", 120.0), 600.0))
        total = max(30.0, min(_env_number("VIGIL_LLM_TOTAL_TIMEOUT", 600.0), 1800.0))
        url = f"{self.provider.base_url.rstrip('/')}{self.provider.chat_path}"

        async def run() -> dict[str, Any]:
            async with httpx.AsyncClient(
                headers={"Authorization": f"Bearer {self.api_key}", "Accept": "text/event-stream"},
                timeout=httpx.Timeout(idle, connect=8), transport=self.transport,
                follow_redirects=False,
            ) as client:
                async with client.stream("POST", url, json={**body, "stream": True}) as response:
                    if response.status_code in (401, 403):
                        raise ProviderInferenceError("provider rejected the configured credential or model access")
                    if response.status_code == 429:
                        raise ProviderInferenceError("provider rate limit reached")
                    if 300 <= response.status_code < 400:
                        raise ProviderInferenceError("provider redirect was refused")
                    if response.status_code >= 500:
                        raise ProviderInferenceError(f"provider service unavailable ({response.status_code})")
                    if response.status_code >= 400:
                        raise ProviderInferenceError(f"provider rejected the request ({response.status_code})")
                    lines = [line async for line in response.aiter_lines()]
            return assemble_stream(lines)

        try:
            return await asyncio.wait_for(run(), timeout=total)
        except ProviderInferenceError:
            raise
        except (asyncio.TimeoutError, httpx.TimeoutException) as exc:
            raise ProviderInferenceError("provider inference timed out") from exc
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise ProviderInferenceError(f"provider inference failed: {type(exc).__name__}") from exc

    async def chat(self, *, messages: list[dict[str, Any]], instructions: str) -> str:
        response = await self.complete(messages=[{"role": "system", "content": instructions}, *messages], tools=[])
        content = response.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ProviderInferenceError("provider returned an empty chat response")
        return content.strip()


OpenAICompatiblePlanner = OpenAICompatibleAdapter
