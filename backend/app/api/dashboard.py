from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database.connection import get_db
from app.database.models import Alert

router = APIRouter()


@router.get("/stats")
def dashboard_stats(db: Session = Depends(get_db)):

    total_alerts = db.query(Alert).count()

    critical_alerts = (
        db.query(Alert)
        .filter(Alert.severity >= 12)
        .count()
    )

    high_alerts = (
        db.query(Alert)
        .filter(
            Alert.severity >= 10,
            Alert.severity < 12
        )
        .count()
    )

    medium_alerts = (
        db.query(Alert)
        .filter(
            Alert.severity >= 7,
            Alert.severity < 10
        )
        .count()
    )

    low_alerts = (
        db.query(Alert)
        .filter(Alert.severity < 7)
        .count()
    )

    return {
        "success": True,
        "data": {
            "total_alerts": total_alerts,
            "critical_alerts": critical_alerts,
            "high_alerts": high_alerts,
            "medium_alerts": medium_alerts,
            "low_alerts": low_alerts
        }
    }