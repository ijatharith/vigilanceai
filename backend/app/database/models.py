from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    JSON,
    Text,
    func
)

from app.database.connection import Base


class Alert(Base):

    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)

    alert_id = Column(String, unique=True, nullable=False, index=True)

    timestamp = Column(String, nullable=True)

    rule_id = Column(String, nullable=True)

    rule_description = Column(String, nullable=True)

    severity = Column(Integer, nullable=True)

    agent_id = Column(String, nullable=True)

    agent_name = Column(String, nullable=True)

    full_event = Column(JSON, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class InvestigationCase(Base):
    """A case this backend submitted to the VIGIL agents service.

    The agents service owns the case, its evidence and its report. This row
    only remembers which cases were started from Vigilance so the dashboard
    can list them, plus a cached status and the analyst's review decision.
    """

    __tablename__ = "investigation_cases"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(String, unique=True, nullable=False, index=True)

    # Where the alert came from: stored_alert | live_alert | manual
    origin = Column(String, nullable=False, default="manual")
    alert_id = Column(String, nullable=True, index=True)
    alert_summary = Column(String, nullable=True)
    alert_level = Column(Integer, nullable=True)

    # Cached from the agents service; refreshed when the dashboard polls.
    status = Column(String, nullable=False, default="queued")
    security_assessment = Column(String, nullable=True)

    # Analyst review: findings_accepted | findings_rejected | escalated
    review_decision = Column(String, nullable=True)
    review_note = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuditEvent(Base):
    """Append-only record of analyst and system actions. Never updated or deleted."""

    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    actor = Column(String, nullable=False)
    action = Column(String, nullable=False, index=True)
    resource = Column(String, nullable=True)
    result = Column(String, nullable=False)  # success | failure
    context = Column(JSON, nullable=True)
