"""Client for the VIGIL agents service (agents/vigil-agents).

The agents run as a separate process with their own virtualenv and API.
This backend only forwards alerts to it and reads results back; it never
imports agent code. The bearer token stays server-side and is never logged
or returned to callers.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import settings

CASE_ID = re.compile(r"^case-[0-9a-f]{12}$")
_LOOPBACK = {"127.0.0.1", "localhost", "::1"}


class AgentsServiceError(RuntimeError):
    """Safe-to-show error. `code` is machine-readable; message has no secrets."""

    def __init__(self, code: str, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class VigilAgentsClient:
    def __init__(self, base_url: str, token: str, *, timeout: float = 15.0,
                 transport: httpx.AsyncBaseTransport | None = None) -> None:
        parsed = urlparse(base_url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("VIGIL_AGENTS_URL must be an http(s) URL")
        # Plain HTTP is only acceptable to this machine; anything else needs TLS.
        if parsed.scheme == "http" and parsed.hostname not in _LOOPBACK:
            raise ValueError("VIGIL_AGENTS_URL must use HTTPS unless it is loopback")
        self.base_url = base_url.rstrip("/")
        self._token = token
        self._timeout = timeout
        self._transport = transport

    async def _request(self, method: str, path: str, *, auth: bool = True,
                       json: Any = None, headers: dict[str, str] | None = None) -> httpx.Response:
        if auth and not self._token:
            raise AgentsServiceError("AGENTS_NOT_CONFIGURED", "The agents service token is not configured.", 503)
        h = dict(headers or {})
        if auth:
            h["Authorization"] = f"Bearer {self._token}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=False,
                                         transport=self._transport) as client:
                return await client.request(method, f"{self.base_url}{path}", json=json, headers=h)
        except httpx.TimeoutException as exc:
            raise AgentsServiceError("AGENTS_TIMEOUT", "The agents service did not respond in time.", 504) from exc
        except httpx.TransportError as exc:
            raise AgentsServiceError("AGENTS_UNAVAILABLE", "The agents service is not reachable.", 503) from exc

    @staticmethod
    def _check(resp: httpx.Response, *, allow: tuple[int, ...] = (200,)) -> dict:
        if resp.status_code in allow:
            try:
                return resp.json()
            except ValueError as exc:
                raise AgentsServiceError("AGENTS_BAD_RESPONSE", "The agents service returned invalid JSON.") from exc
        if resp.status_code in (401, 403):
            raise AgentsServiceError("AGENTS_AUTH_FAILED", "The agents service rejected the backend's token.", 502)
        if resp.status_code == 404:
            raise AgentsServiceError("CASE_NOT_FOUND", "Investigation case not found.", 404)
        if resp.status_code == 409:
            detail = _detail_code(resp)
            msg = {
                "report_not_ready": "The report is not ready yet.",
                "report_unavailable": "The investigation ended without a report.",
                "idempotency_conflict": "This alert was already submitted with different content.",
            }.get(detail, "The request conflicts with the investigation's current state.")
            raise AgentsServiceError(detail.upper() if detail else "CONFLICT", msg, 409)
        if resp.status_code in (413, 422):
            raise AgentsServiceError("INVALID_ALERT", "The alert was rejected as invalid or too large.", 422)
        if 300 <= resp.status_code < 400:
            raise AgentsServiceError("AGENTS_REDIRECT_REFUSED", "The agents service tried to redirect; refused.")
        raise AgentsServiceError("AGENTS_ERROR", f"The agents service failed ({resp.status_code}).")

    async def health(self) -> dict:
        return self._check(await self._request("GET", "/ready", auth=False))

    async def submit(self, alert: dict, idempotency_key: str | None = None) -> dict:
        headers = {"X-Idempotency-Key": idempotency_key[:200]} if idempotency_key else None
        resp = await self._request("POST", "/api/v1/investigations", json={"alert": alert}, headers=headers)
        return self._check(resp, allow=(200, 202))

    async def status(self, case_id: str) -> dict:
        return self._check(await self._request("GET", f"/api/v1/investigations/{_valid(case_id)}"))

    async def report(self, case_id: str) -> dict:
        return self._check(await self._request("GET", f"/api/v1/investigations/{_valid(case_id)}/report"))

    async def agents(self) -> dict | list:
        return self._check(await self._request("GET", "/api/v1/agents"))


def _valid(case_id: str) -> str:
    if not CASE_ID.fullmatch(case_id):
        raise AgentsServiceError("INVALID_CASE_ID", "Case ID must look like case-<12 hex characters>.", 422)
    return case_id


def _detail_code(resp: httpx.Response) -> str:
    try:
        detail = resp.json().get("detail")
    except ValueError:
        return ""
    return detail.get("code", "") if isinstance(detail, dict) else ""


vigil_agents = VigilAgentsClient(settings.VIGIL_AGENTS_URL, settings.VIGIL_AGENTS_TOKEN)
