"""Safe error envelope shared by all routes.

Shape: {"success": false, "error": {"code": "...", "message": "..."}}
Messages never contain credentials, URLs with secrets, stack traces or raw
exception text. The original exception is logged server-side instead.
"""

from __future__ import annotations

import logging

import httpx
from fastapi.responses import JSONResponse

log = logging.getLogger("vigilance.api")


def api_error(code: str, message: str, status_code: int = 502) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "error": {"code": code, "message": message}},
    )


def upstream_error(exc: Exception, service: str, prefix: str) -> JSONResponse:
    """Map an exception from a Wazuh call to a safe, typed error."""
    log.warning("%s call failed: %s", service, type(exc).__name__, exc_info=exc)
    if isinstance(exc, ValueError):
        return api_error(f"{prefix}_NOT_CONFIGURED", f"{service} is not configured on the backend.", 503)
    if isinstance(exc, httpx.TimeoutException):
        return api_error(f"{prefix}_TIMEOUT", f"{service} did not respond in time.", 504)
    if isinstance(exc, httpx.TransportError):
        return api_error(f"{prefix}_UNAVAILABLE", f"{service} is not reachable.", 503)
    if isinstance(exc, httpx.HTTPStatusError):
        if exc.response.status_code in (401, 403):
            return api_error(f"{prefix}_AUTH_FAILED", f"{service} rejected the backend's credentials.", 502)
        return api_error(f"{prefix}_ERROR", f"{service} returned HTTP {exc.response.status_code}.", 502)
    return api_error(f"{prefix}_ERROR", f"{service} request failed.", 502)
