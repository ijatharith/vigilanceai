from fastapi import FastAPI
from app.api.routes import router
from app.api.dashboard import router as dashboard_router

app = FastAPI(
    title="Vigil API",
    description="AI-Assisted SIEM and SOAR Platform",
    version="0.1.0"
)


@app.get("/")
async def root():

    return {
        "application": "Vigil",
        "status": "running",
        "version": "0.1.0"
    }


app.include_router(
    router,
    prefix="/api/v1",
    tags=["Wazuh Integration"]
)



app.include_router(
    dashboard_router,
    prefix="/api/v1/dashboard",
    tags=["Dashboard"]
)