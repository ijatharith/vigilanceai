import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError

from app.api.dashboard import router as dashboard_router
from app.api.errors import api_error
from app.api.investigations import router as investigations_router
from app.api.routes import router
from app.api.system import router as system_router

log = logging.getLogger("vigilance")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Create any missing tables (idempotent). The backend still starts if the
    # database is down; DB-backed routes then return DATABASE_UNAVAILABLE.
    try:
        from app.database.init_db import initialize_database
        initialize_database()
    except Exception:  # noqa: BLE001
        log.warning("Database initialisation skipped: database not reachable")
    yield


app = FastAPI(
    title="Vigilance API",
    description="AI-Assisted SIEM and SOAR Platform",
    version="0.1.0",
    lifespan=lifespan,
)

# The dashboard normally reaches the API through the Vite dev proxy (same
# origin). CORS is limited to the configured frontend origin for other setups.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(SQLAlchemyError)
async def database_error(_: Request, exc: SQLAlchemyError):
    log.warning("Database error: %s", type(exc).__name__, exc_info=exc)
    return api_error("DATABASE_UNAVAILABLE", "The Vigilance database is not reachable.", 503)


@app.exception_handler(Exception)
async def unexpected_error(_: Request, exc: Exception):
    log.error("Unhandled error", exc_info=exc)
    return api_error("INTERNAL_ERROR", "The backend hit an unexpected error.", 500)


@app.get("/")
async def root():
    return {"application": "Vigilance", "status": "running", "version": "0.1.0"}


app.include_router(router, prefix="/api/v1", tags=["Wazuh Integration"])
app.include_router(system_router, prefix="/api/v1", tags=["System"])
app.include_router(dashboard_router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(investigations_router, prefix="/api/v1/ai", tags=["AI Investigations"])
