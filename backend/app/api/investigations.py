"""AI investigation routes: forward alerts to the VIGIL agents service.

Read-only: these routes start investigations, read reports and record the
analyst's review. The agents never execute response actions (their reports
enforce response_executed=false), and nothing here executes one either.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import Alert, InvestigationCase
from app.integrations.vigil_agents import AgentsServiceError, vigil_agents
from app.services.audit import record_audit

router = APIRouter()

CASE_ID_PATTERN = r"^case-[0-9a-f]{12}$"
TERMINAL = {"completed", "partial", "failed", "cancelled"}
REFRESH_LIMIT = 20


class InvestigateRequest(BaseModel):
    alert: dict[str, Any] = Field(..., description="Wazuh alert object (the _source, plus id if known)")
    origin: Literal["live_alert", "manual"] = "manual"


class ReviewRequest(BaseModel):
    decision: Literal["findings_accepted", "findings_rejected", "escalated"]
    note: str = Field(default="", max_length=1000)


def _error(exc: AgentsServiceError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {"code": exc.code, "message": exc.message}},
    )


def _alert_facts(alert: dict[str, Any]) -> tuple[str | None, str | None, int | None]:
    """Pull an ID, a one-line summary and a Wazuh level out of any alert shape."""
    native = alert.get("_source") if isinstance(alert.get("_source"), dict) else alert
    rule = native.get("rule") if isinstance(native.get("rule"), dict) else {}
    alert_id = alert.get("alert_id") or alert.get("_id") or alert.get("id") or native.get("id")
    summary = (
        rule.get("description") or alert.get("description") or alert.get("attack")
        or alert.get("category") or None
    )
    level = rule.get("level")
    return (
        str(alert_id)[:200] if alert_id else None,
        str(summary)[:300] if summary else None,
        level if isinstance(level, int) else None,
    )


def _case_row(c: InvestigationCase) -> dict:
    return {
        "case_id": c.case_id,
        "origin": c.origin,
        "alert_id": c.alert_id,
        "alert_summary": c.alert_summary,
        "alert_level": c.alert_level,
        "status": c.status,
        "security_assessment": c.security_assessment,
        "review_decision": c.review_decision,
        "review_note": c.review_note,
        "reviewed_at": c.reviewed_at.isoformat() if c.reviewed_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def _remember(db: Session, submission: dict, *, origin: str, alert: dict[str, Any]) -> None:
    case_id = submission.get("case_id")
    if not case_id:
        return
    existing = db.query(InvestigationCase).filter(InvestigationCase.case_id == case_id).first()
    alert_id, summary, level = _alert_facts(alert)
    if existing is None:
        db.add(InvestigationCase(
            case_id=case_id, origin=origin, alert_id=alert_id, alert_summary=summary,
            alert_level=level, status=submission.get("status") or "queued",
        ))
        db.commit()
    record_audit(
        db, "investigation.submit", resource=case_id,
        context={"origin": origin, "alert_id": alert_id, "created": submission.get("created", True)},
    )


def _cache_status(db: Session, case_id: str, status: str | None = None, assessment: str | None = None) -> None:
    row = db.query(InvestigationCase).filter(InvestigationCase.case_id == case_id).first()
    if row is None:
        return
    changed = False
    if status and row.status != status:
        row.status, changed = status, True
    if assessment and row.security_assessment != assessment:
        row.security_assessment, changed = assessment, True
    if changed:
        db.commit()


@router.get("/health")
async def agents_health():
    try:
        return {"success": True, "data": await vigil_agents.health()}
    except AgentsServiceError as exc:
        return _error(exc)


@router.get("/agents")
async def list_agents():
    try:
        return {"success": True, "data": await vigil_agents.agents()}
    except AgentsServiceError as exc:
        return _error(exc)


@router.get("/investigations")
async def list_investigations(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Cases started from Vigilance, newest first. Non-terminal statuses are
    refreshed from the agents service; if it is down, cached values are returned."""
    rows = db.query(InvestigationCase).order_by(InvestigationCase.created_at.desc()).limit(limit).all()
    pending = [r for r in rows if r.status not in TERMINAL][:REFRESH_LIMIT]
    reachable = True
    if pending:
        results = await asyncio.gather(*(vigil_agents.status(r.case_id) for r in pending), return_exceptions=True)
        for row, result in zip(pending, results):
            if isinstance(result, AgentsServiceError):
                if result.code in {"AGENTS_UNAVAILABLE", "AGENTS_TIMEOUT", "AGENTS_NOT_CONFIGURED"}:
                    reachable = False
                continue
            if isinstance(result, dict) and result.get("status"):
                row.status = result["status"]
        db.commit()
    return {
        "success": True,
        "data": [_case_row(r) for r in rows],
        "meta": {"count": len(rows), "agents_reachable": reachable, "refreshed": len(pending)},
    }


@router.post("/investigations", status_code=202)
async def investigate(body: InvestigateRequest, db: Session = Depends(get_db)):
    if not body.alert:
        return _error(AgentsServiceError("INVALID_ALERT", "Alert cannot be empty.", 422))
    alert_id, _, _ = _alert_facts(body.alert)
    # A Wazuh alert with an ID reuses its case, matching /from-alert/{id}.
    key = f"wazuh:{alert_id}" if body.origin == "live_alert" and alert_id else None
    try:
        data = await vigil_agents.submit(body.alert, idempotency_key=key)
    except AgentsServiceError as exc:
        record_audit(db, "investigation.submit", result="failure", context={"origin": body.origin, "code": exc.code})
        return _error(exc)
    _remember(db, data, origin=body.origin, alert=body.alert)
    return {"success": True, "data": data}


@router.post("/investigations/from-alert/{alert_id}", status_code=202)
async def investigate_stored_alert(
    alert_id: str = Path(..., min_length=1, max_length=200),
    db: Session = Depends(get_db),
):
    """Investigate an alert already synced into PostgreSQL (POST /alerts/sync)."""
    stored = db.query(Alert).filter(Alert.alert_id == alert_id).first()
    if stored is None:
        return _error(AgentsServiceError("ALERT_NOT_FOUND", "No stored alert with that ID. Sync alerts first.", 404))
    try:
        # Idempotency key = alert ID, so re-submitting the same alert reuses its case.
        data = await vigil_agents.submit(stored.full_event, idempotency_key=f"wazuh:{alert_id}")
    except AgentsServiceError as exc:
        record_audit(db, "investigation.submit", resource=alert_id, result="failure",
                     context={"origin": "stored_alert", "code": exc.code})
        return _error(exc)
    _remember(db, data, origin="stored_alert", alert=stored.full_event)
    return {"success": True, "data": data}


@router.get("/investigations/{case_id}")
async def investigation_status(case_id: str = Path(..., pattern=CASE_ID_PATTERN), db: Session = Depends(get_db)):
    try:
        data = await vigil_agents.status(case_id)
    except AgentsServiceError as exc:
        return _error(exc)
    _cache_status(db, case_id, status=data.get("status"))
    row = db.query(InvestigationCase).filter(InvestigationCase.case_id == case_id).first()
    return {"success": True, "data": data, "meta": {"case": _case_row(row) if row else None}}


@router.get("/investigations/{case_id}/report")
async def investigation_report(case_id: str = Path(..., pattern=CASE_ID_PATTERN), db: Session = Depends(get_db)):
    try:
        data = await vigil_agents.report(case_id)
    except AgentsServiceError as exc:
        return _error(exc)
    _cache_status(db, case_id, status=data.get("status"), assessment=data.get("security_assessment"))
    return {"success": True, "data": data}


@router.post("/investigations/{case_id}/review")
def review_investigation(
    body: ReviewRequest,
    case_id: str = Path(..., pattern=CASE_ID_PATTERN),
    db: Session = Depends(get_db),
):
    """Record the analyst's decision on the AI findings. Executes nothing."""
    row = db.query(InvestigationCase).filter(InvestigationCase.case_id == case_id).first()
    if row is None:
        return _error(AgentsServiceError("CASE_NOT_FOUND", "This case was not started from Vigilance.", 404))
    if row.status not in {"completed", "partial"}:
        return _error(AgentsServiceError("CASE_NOT_REVIEWABLE", "Only completed investigations can be reviewed.", 409))
    row.review_decision = body.decision
    row.review_note = body.note.strip() or None
    row.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    record_audit(db, "investigation.review", resource=case_id,
                 context={"decision": body.decision, "has_note": bool(row.review_note)})
    return {"success": True, "data": _case_row(row)}


@router.get("/recommendations")
async def recommendations(
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Next steps proposed by completed investigations. These are suggestions
    for a human; none has been executed (response_executed is always false)."""
    rows = (
        db.query(InvestigationCase)
        .filter(InvestigationCase.status.in_(["completed", "partial"]))
        .order_by(InvestigationCase.created_at.desc())
        .limit(limit)
        .all()
    )
    reports = await asyncio.gather(*(vigil_agents.report(r.case_id) for r in rows), return_exceptions=True)
    items, unavailable = [], 0
    for row, report in zip(rows, reports):
        if not isinstance(report, dict):
            unavailable += 1
            continue
        for index, step in enumerate(report.get("next_steps") or []):
            items.append({
                "id": f"{row.case_id}:{index}",
                "case_id": row.case_id,
                "alert_summary": row.alert_summary,
                "security_assessment": report.get("security_assessment"),
                "recommendation": step,
                "review_decision": row.review_decision,
                "response_executed": bool(report.get("response_executed")),
                "case_created_at": row.created_at.isoformat() if row.created_at else None,
            })
    return {"success": True, "data": items, "meta": {"cases": len(rows), "reports_unavailable": unavailable}}
