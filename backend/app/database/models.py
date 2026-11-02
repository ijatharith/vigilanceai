from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    JSON,
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