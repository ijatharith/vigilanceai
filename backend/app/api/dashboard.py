from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import Alert, InvestigationCase

router = APIRouter()

TERMINAL = {"completed", "partial", "failed", "cancelled"}
ACTIVITY_HOURS = 24
ACTIVITY_SCAN_LIMIT = 5000


def _parse_ts(value: str | None) -> datetime | None:
    """Wazuh timestamps look like 2026-10-19T16:17:52.977+0000."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _activity(db: Session) -> dict:
    """Hourly counts for the 24 h ending at the most recent stored alert.

    Anchored to the newest stored alert rather than "now" so the chart shows
    the synced data honestly even when no sync has happened recently.
    """
    rows = (
        db.query(Alert.timestamp, Alert.severity)
        .order_by(Alert.timestamp.desc())
        .limit(ACTIVITY_SCAN_LIMIT)
        .all()
    )
    parsed = [(ts, lvl) for ts, lvl in ((_parse_ts(t), s) for t, s in rows) if ts]
    if not parsed:
        return {"window_start": None, "window_end": None, "buckets": []}

    end = max(ts for ts, _ in parsed).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    start = end - timedelta(hours=ACTIVITY_HOURS)
    buckets = [
        {"hour": (start + timedelta(hours=i)).isoformat(), "critical": 0, "high": 0, "medium": 0, "low": 0}
        for i in range(ACTIVITY_HOURS)
    ]
    for ts, level in parsed:
        if not (start <= ts < end):
            continue
        idx = int((ts - start).total_seconds() // 3600)
        lvl = level or 0
        group = "critical" if lvl >= 12 else "high" if lvl >= 10 else "medium" if lvl >= 7 else "low"
        buckets[idx][group] += 1
    return {"window_start": start.isoformat(), "window_end": end.isoformat(), "buckets": buckets}


@router.get("/stats")
def dashboard_stats(db: Session = Depends(get_db)):

    total_alerts = db.query(Alert).count()
    critical_alerts = db.query(Alert).filter(Alert.severity >= 12).count()
    high_alerts = db.query(Alert).filter(Alert.severity >= 10, Alert.severity < 12).count()
    medium_alerts = db.query(Alert).filter(Alert.severity >= 7, Alert.severity < 10).count()
    low_alerts = db.query(Alert).filter(Alert.severity < 7).count()

    latest = db.query(func.max(Alert.timestamp)).scalar()

    top_rules = (
        db.query(Alert.rule_id, Alert.rule_description, func.count(Alert.id).label("n"))
        .group_by(Alert.rule_id, Alert.rule_description)
        .order_by(func.count(Alert.id).desc())
        .limit(5)
        .all()
    )
    by_agent = (
        db.query(Alert.agent_id, Alert.agent_name, func.count(Alert.id).label("n"))
        .group_by(Alert.agent_id, Alert.agent_name)
        .order_by(func.count(Alert.id).desc())
        .limit(20)
        .all()
    )

    cases = db.query(InvestigationCase.status, InvestigationCase.review_decision).all()
    case_status = Counter(status for status, _ in cases)
    awaiting_review = sum(1 for status, review in cases if status in {"completed", "partial"} and not review)

    return {
        "success": True,
        "data": {
            "total_alerts": total_alerts,
            "critical_alerts": critical_alerts,
            "high_alerts": high_alerts,
            "medium_alerts": medium_alerts,
            "low_alerts": low_alerts,
            "latest_alert_at": latest,
            "top_rules": [{"rule_id": r, "description": d, "count": n} for r, d, n in top_rules],
            "alerts_by_agent": [{"agent_id": a, "agent_name": name, "count": n} for a, name, n in by_agent],
            "activity": _activity(db),
            "investigations": {
                "total": len(cases),
                "active": sum(n for s, n in case_status.items() if s not in TERMINAL),
                "completed": case_status.get("completed", 0) + case_status.get("partial", 0),
                "failed": case_status.get("failed", 0) + case_status.get("cancelled", 0),
                "awaiting_review": awaiting_review,
            },
        },
    }
