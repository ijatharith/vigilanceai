from sqlalchemy.orm import Session

from app.database.models import Alert


def save_alerts(db: Session, alerts: list):

    inserted = 0
    skipped = 0

    for item in alerts:

        alert_id = item.get("id")

        if not alert_id:
            skipped += 1
            continue

        existing = (
            db.query(Alert)
            .filter(Alert.alert_id == alert_id)
            .first()
        )

        if existing:
            skipped += 1
            continue

        rule = item.get("rule") or {}
        agent = item.get("agent") or {}

        alert = Alert(
            alert_id=alert_id,
            timestamp=item.get("timestamp"),
            rule_id=str(rule.get("id"))
                if rule.get("id") is not None else None,
            rule_description=rule.get("description"),
            severity=rule.get("level"),
            agent_id=str(agent.get("id"))
                if agent.get("id") is not None else None,
            agent_name=agent.get("name"),
            full_event=item
        )

        db.add(alert)
        inserted += 1

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "inserted": inserted,
        "skipped": skipped
    }