"""Append-only audit trail for analyst and system actions."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.database.models import AuditEvent

log = logging.getLogger("vigilance.audit")

# There is no authentication yet, so every action is attributed to the
# local operator. Replace with the authenticated user once auth exists.
LOCAL_ACTOR = "local-analyst (unauthenticated)"


def record_audit(
    db: Session,
    action: str,
    *,
    resource: str | None = None,
    result: str = "success",
    context: dict[str, Any] | None = None,
    actor: str = LOCAL_ACTOR,
) -> None:
    """Best effort: a failed audit write is logged, never raised to the caller,
    so it cannot hide the outcome of the action it describes."""
    try:
        db.add(AuditEvent(actor=actor, action=action, resource=resource, result=result, context=context or {}))
        db.commit()
    except Exception:  # noqa: BLE001 - audit must not break the request
        db.rollback()
        log.warning("Audit write failed for action=%s resource=%s", action, resource)
