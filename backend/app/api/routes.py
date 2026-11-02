from fastapi import APIRouter, HTTPException, Query

from app.integrations.wazuh import wazuh
from app.integrations.indexer import indexer

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.services.alert_service import save_alerts


router = APIRouter()


@router.get("/wazuh/status")
async def wazuh_status():

    try:
        result = await wazuh.get_manager_status()

        return {
            "success": True,
            "source": "Wazuh",
            "data": result
        }

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Wazuh connection failed: {str(e)}"
        )


@router.get("/wazuh/agents")
async def wazuh_agents():

    try:
        result = await wazuh.get_agents()

        return {
            "success": True,
            "source": "Wazuh",
            "data": result
        }

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Unable to retrieve agents: {str(e)}"
        )


@router.get("/alerts")
@router.get("/wazuh/alerts")
async def get_alerts(
    limit: int = Query(default=50, ge=1, le=100)
):

    try:
        alerts = await indexer.get_alerts(limit)

        return {
            "success": True,
            "count": len(alerts),
            "data": alerts
        }

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Unable to retrieve Wazuh alerts: {str(e)}"
        )



@router.post("/alerts/sync")
async def sync_alerts(
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db)
):

    try:
        alerts = await indexer.get_alerts(limit)

        result = save_alerts(db, alerts)

        return {
            "success": True,
            "retrieved": len(alerts),
            "inserted": result["inserted"],
            "skipped": result["skipped"]
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Alert synchronization failed: {str(e)}"
        )