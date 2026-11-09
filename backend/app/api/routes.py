from typing import Literal

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.errors import api_error, upstream_error
from app.database.connection import get_db
from app.database.models import Alert
from app.integrations.indexer import indexer
from app.integrations.wazuh import wazuh
from app.services.alert_service import save_alerts
from app.services.audit import record_audit


router = APIRouter()

# Wazuh rule level -> severity group (same thresholds as /dashboard/stats).
SEVERITY_RANGES: dict[str, tuple[int, int]] = {
    "critical": (12, 99),
    "high": (10, 11),
    "medium": (7, 9),
    "low": (0, 6),
}


@router.get("/wazuh/status")
async def wazuh_status():
    try:
        result = await wazuh.get_manager_status()
    except Exception as exc:  # noqa: BLE001
        return upstream_error(exc, "Wazuh Manager", "WAZUH_MANAGER")
    return {"success": True, "source": "Wazuh", "data": result}


@router.get("/wazuh/agents")
async def wazuh_agents(limit: int = Query(default=50, ge=1, le=500)):
    try:
        result = await wazuh.get_agents(limit)
    except Exception as exc:  # noqa: BLE001
        return upstream_error(exc, "Wazuh Manager", "WAZUH_MANAGER")
    return {"success": True, "source": "Wazuh", "data": result}


@router.get("/alerts")
@router.get("/wazuh/alerts")
async def get_alerts(limit: int = Query(default=50, ge=1, le=100)):
    """Live alerts from the Wazuh Indexer (last 24 h)."""
    try:
        alerts = await indexer.get_alerts(limit)
    except Exception as exc:  # noqa: BLE001
        return upstream_error(exc, "Wazuh Indexer", "WAZUH_INDEXER")
    return {"success": True, "count": len(alerts), "data": alerts}


@router.post("/alerts/sync")
async def sync_alerts(
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    try:
        alerts = await indexer.get_alerts(limit)
    except Exception as exc:  # noqa: BLE001
        record_audit(db, "alerts.sync", resource="wazuh-indexer", result="failure", context={"limit": limit})
        return upstream_error(exc, "Wazuh Indexer", "WAZUH_INDEXER")

    result = save_alerts(db, alerts)
    record_audit(
        db, "alerts.sync", resource="wazuh-indexer",
        context={"limit": limit, "retrieved": len(alerts), **result},
    )
    return {
        "success": True,
        "retrieved": len(alerts),
        "inserted": result["inserted"],
        "skipped": result["skipped"],
    }


def _serialize(alert: Alert, *, full: bool) -> dict:
    event = alert.full_event or {}
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    agent = event.get("agent") if isinstance(event.get("agent"), dict) else {}
    rule = event.get("rule") if isinstance(event.get("rule"), dict) else {}
    row = {
        "alert_id": alert.alert_id,
        "timestamp": alert.timestamp,
        "rule_id": alert.rule_id,
        "rule_description": alert.rule_description,
        "level": alert.severity,
        "agent_id": alert.agent_id,
        "agent_name": alert.agent_name,
        "agent_ip": agent.get("ip"),
        "source_ip": data.get("srcip"),
        "rule_groups": rule.get("groups") or [],
        "mitre": rule.get("mitre") or None,
        "stored_at": alert.created_at.isoformat() if alert.created_at else None,
    }
    if full:
        row["full_event"] = event
    return row


@router.get("/alerts/stored")
def list_stored_alerts(
    q: str | None = Query(default=None, max_length=200, description="Search description, rule ID or agent name"),
    severity: Literal["critical", "high", "medium", "low"] | None = None,
    agent_id: str | None = Query(default=None, max_length=50),
    rule_id: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0, le=100_000),
    db: Session = Depends(get_db),
):
    """Alerts already synced into PostgreSQL, newest first."""
    query = db.query(Alert)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Alert.rule_description.ilike(like),
            Alert.rule_id.ilike(like),
            Alert.agent_name.ilike(like),
            Alert.alert_id.ilike(like),
        ))
    if severity:
        low, high = SEVERITY_RANGES[severity]
        query = query.filter(Alert.severity >= low, Alert.severity <= high)
    if agent_id:
        query = query.filter(Alert.agent_id == agent_id)
    if rule_id:
        query = query.filter(Alert.rule_id == rule_id)

    total = query.count()
    rows = query.order_by(Alert.timestamp.desc(), Alert.id.desc()).offset(offset).limit(limit).all()
    return {
        "success": True,
        "data": [_serialize(a, full=False) for a in rows],
        "meta": {"count": len(rows), "total": total, "limit": limit, "offset": offset},
    }


@router.get("/alerts/stored/{alert_id}")
def get_stored_alert(
    alert_id: str = Path(..., min_length=1, max_length=200),
    db: Session = Depends(get_db),
):
    alert = db.query(Alert).filter(Alert.alert_id == alert_id).first()
    if alert is None:
        return api_error("ALERT_NOT_FOUND", "No stored alert with that ID.", 404)

    related = []
    if alert.rule_id:
        related = (
            db.query(Alert)
            .filter(Alert.rule_id == alert.rule_id, Alert.alert_id != alert.alert_id)
            .order_by(Alert.timestamp.desc())
            .limit(5)
            .all()
        )
    return {
        "success": True,
        "data": {
            **_serialize(alert, full=True),
            "related": [_serialize(r, full=False) for r in related],
        },
    }
