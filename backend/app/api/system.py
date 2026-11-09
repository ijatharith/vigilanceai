"""System health, masked integration settings and the audit log.

Health checks probe each dependency with a short timeout so one slow service
cannot stall the dashboard. Settings never return secrets: only whether each
one is configured.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.connection import DATABASE_URL, engine, get_db
from app.database.models import AuditEvent
from app.integrations.indexer import indexer
from app.integrations.vigil_agents import AgentsServiceError, vigil_agents
from app.integrations.wazuh import wazuh

router = APIRouter()

CHECK_TIMEOUT = 6.0
APP_VERSION = "0.1.0"


async def _probe(name: str, fn: Callable[[], Awaitable[dict]], configured: bool) -> dict[str, Any]:
    if not configured:
        return {"name": name, "status": "not_configured", "latency_ms": None, "message": "Not configured on the backend.", "detail": {}}
    start = time.perf_counter()
    try:
        detail = await asyncio.wait_for(fn(), timeout=CHECK_TIMEOUT)
        status, message = "connected", "Reachable."
    except asyncio.TimeoutError:
        detail, status, message = {}, "unavailable", "Did not respond in time."
    except AgentsServiceError as exc:
        detail, status, message = {"code": exc.code}, "unavailable", exc.message
    except Exception as exc:  # noqa: BLE001 - message stays generic, never raw exception text
        detail, status, message = {"error_type": type(exc).__name__}, "unavailable", "Not reachable or rejected the request."
    return {
        "name": name,
        "status": status,
        "latency_ms": round((time.perf_counter() - start) * 1000),
        "message": message,
        "detail": detail,
    }


async def _database() -> dict:
    def ping() -> dict:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"dialect": engine.dialect.name}
    return await run_in_threadpool(ping)


async def _manager() -> dict:
    result = await wazuh.get_manager_status()
    items = (result.get("data") or {}).get("affected_items") or [{}]
    daemons = items[0] if isinstance(items[0], dict) else {}
    running = sum(1 for v in daemons.values() if v == "running")
    return {"daemons_running": running, "daemons_total": len(daemons), "daemons": daemons}


async def _agents() -> dict:
    return await vigil_agents.health()


@router.get("/health")
async def system_health():
    checks = await asyncio.gather(
        _probe("database", _database, bool(DATABASE_URL)),
        _probe("wazuh_manager", _manager, bool(settings.wazuh_url and settings.WAZUH_USERNAME and settings.WAZUH_PASSWORD)),
        _probe("wazuh_indexer", indexer.ping, indexer.configured),
        _probe("vigil_agents", _agents, bool(settings.VIGIL_AGENTS_URL and settings.VIGIL_AGENTS_TOKEN)),
    )
    connected = sum(1 for c in checks if c["status"] == "connected")
    overall = "healthy" if connected == len(checks) else "degraded" if connected else "down"
    return {
        "success": True,
        "data": {
            "backend": {"status": "running", "version": APP_VERSION},
            "overall": overall,
            "services": {c["name"]: c for c in checks},
        },
    }


def _host(url: str) -> str | None:
    if not url:
        return None
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.hostname}{':' + str(parsed.port) if parsed.port else ''}"


@router.get("/settings/integrations")
def integration_settings():
    """Non-secret configuration summary. Secrets are reported only as configured/missing."""
    db_url = None
    if DATABASE_URL:
        try:
            url = make_url(DATABASE_URL)
            db_url = f"{url.drivername}://{url.host or 'localhost'}{':' + str(url.port) if url.port else ''}/{url.database or ''}"
        except Exception:  # noqa: BLE001
            db_url = "configured (unparseable)"
    return {
        "success": True,
        "data": {
            "wazuh_manager": {
                "url": _host(settings.wazuh_url),
                "verify_tls": settings.WAZUH_VERIFY_SSL,
                "username_configured": bool(settings.WAZUH_USERNAME),
                "password_configured": bool(settings.WAZUH_PASSWORD),
            },
            "wazuh_indexer": {
                "url": _host(settings.WAZUH_INDEXER_URL),
                "verify_tls": settings.WAZUH_INDEXER_VERIFY_SSL,
                "username_configured": bool(settings.WAZUH_INDEXER_USERNAME),
                "password_configured": bool(settings.WAZUH_INDEXER_PASSWORD),
            },
            "vigil_agents": {
                "url": _host(settings.VIGIL_AGENTS_URL),
                "token_configured": bool(settings.VIGIL_AGENTS_TOKEN),
            },
            "database": {"url": db_url},
            "soar": {"n8n_configured": False, "note": "n8n / SOAR integration is planned for Phase 5."},
            "auth": {"enabled": False, "note": "No authentication yet. Run on localhost only."},
            "version": APP_VERSION,
        },
    }


@router.get("/audit-logs")
def audit_logs(
    action: str | None = Query(default=None, max_length=100),
    result: str | None = Query(default=None, pattern="^(success|failure)$"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Immutable audit trail, newest first. There are no write or delete routes."""
    query = db.query(AuditEvent)
    if action:
        query = query.filter(AuditEvent.action == action)
    if result:
        query = query.filter(AuditEvent.result == result)
    total = query.count()
    rows = query.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).offset(offset).limit(limit).all()
    actions = [a for (a,) in db.query(AuditEvent.action).distinct().all()]
    return {
        "success": True,
        "data": [
            {
                "id": r.id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "actor": r.actor,
                "action": r.action,
                "resource": r.resource,
                "result": r.result,
                "context": r.context or {},
            }
            for r in rows
        ],
        "meta": {"count": len(rows), "total": total, "actions": sorted(actions)},
    }
