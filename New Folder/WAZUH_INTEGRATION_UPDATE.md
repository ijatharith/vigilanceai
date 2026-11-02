# Vigilance Project Update: Wazuh API Integration & Connector Fixes

> **Context Document for AI Coding Assistants**  
> **Date:** 19 October 2026  
> **Project:** Vigilance (AI-assisted SIEM/SOAR platform for Final Year Project)  
> **Status:** Phase 3 (Wazuh API Connector) Verified & Active; Transitioning to Phase 4 (AI-Agent Development).

---

## 1. Executive Summary

This document records the troubleshooting, architectural refinements, and live verification of the **Wazuh API Integration** for the Vigilance backend. 

Prior to these changes, calling `/api/v1/wazuh/status` or `/api/v1/wazuh/agents` produced a `502 Bad Gateway` error due to unmapped environment variables causing HTTP Basic Authentication failure. These issues have been resolved, and live communication between FastAPI and the Wazuh Manager (hosted on an Ubuntu VM) is fully verified and functional.

---

## 2. Problem Statement & Root Cause

### Symptoms
When requesting Wazuh status or agent lists via Swagger UI or curl:
- **`GET /api/v1/wazuh/status`** returned:
  ```json
  {
    "detail": "Wazuh connection failed: sequence item 0: expected a bytes-like object, NoneType found"
  }
  ```
- **`GET /api/v1/wazuh/agents`** returned:
  ```json
  {
    "detail": "Unable to retrieve agents: sequence item 0: expected a bytes-like object, NoneType found"
  }
  ```

### Root Cause Analysis
1. **Variable Name Mismatch**:
   - `backend/.env` provided credentials using `WAZUH_API_URL`, `WAZUH_API_USERNAME`, and `WAZUH_API_PASSWORD`.
   - `backend/app/core/config.py` was looking specifically for `WAZUH_HOST`, `WAZUH_PORT`, `WAZUH_USERNAME`, and `WAZUH_PASSWORD`.
   - As a result, `settings.WAZUH_USERNAME` and `settings.WAZUH_PASSWORD` evaluated to `None`.
2. **Basic Auth Failure in `httpx`**:
   - In `backend/app/integrations/wazuh.py`, `httpx.AsyncClient` attempted basic authentication using `auth=(None, None)`.
   - `httpx` internally encodes credentials by joining byte elements: `b":".join([username, password])`. Because sequence item 0 (`username`) was `None`, Python raised:
     `TypeError: sequence item 0: expected a bytes-like object, NoneType found`.
3. **SSL Certificate Verification**:
   - Default Wazuh Manager installations use self-signed certificates on port `55000`.
   - `WAZUH_VERIFY_SSL` defaulted to `True`, which would trigger `SSLCertVerificationError` once credentials were resolved.

---

## 3. Changes Applied

### A. Central Configuration (`backend/app/core/config.py`)
- Supported both environment naming conventions (`WAZUH_API_URL` vs. `WAZUH_HOST:WAZUH_PORT`, `WAZUH_API_USERNAME` vs. `WAZUH_USERNAME`, etc.).
- Defaulted `WAZUH_VERIFY_SSL` to `False` for local/VM lab environments.
- Ensured `.env` is reliably discovered relative to the backend directory.

### B. Wazuh Clients (`backend/app/integrations/wazuh.py` & `indexer.py`)
- **`wazuh.py`**: Converted `base_url` to a dynamic property that queries `settings.wazuh_url`. Added defensive validation, default timeout (`15.0s`), and custom limit support for `get_agents(limit: int = 50)`.
- **`indexer.py`**: Created `WazuhIndexer` client querying OpenSearch/Elasticsearch (`https://127.0.0.1:9200/wazuh-alerts-*/_search`) for live security alerts within a customizable time window (`now-24h` by default).

### C. Alerts Endpoint (`backend/app/api/routes.py`)
- Cleaned up imports at the top of the file.
- Preserved existing `/wazuh/status` and `/wazuh/agents` routes.
- Added `/alerts` (and alias `/wazuh/alerts`) with configurable `limit` query parameter (1-100) returning structured alert telemetry.

### D. Environment, Dependencies & Git Security
- Added `WAZUH_INDEXER_URL`, `WAZUH_INDEXER_USERNAME`, `WAZUH_INDEXER_PASSWORD`, `WAZUH_INDEXER_VERIFY_SSL` to `backend/.env`.
- Added `httpx` to `backend/requirement.txt`.
- Created root `.gitignore` to ensure `.env`, bytecode, and `venv` folders are never committed to version control.
- Updated `.env.example` with clear documentation of supported environment variable keys.

### E. Source of Truth Update (`VIGILANCE_PROJECT_CONTEXT.md`)
- Updated progress tracking to mark **Phase 3 (Wazuh API & Indexer Integration)** as verified and active.
- Documented verified reachability of both Wazuh Manager (port 55000) and Wazuh Indexer (port 9200).

---

## 4. Verification & Testing Evidence

All tests were performed against the live Wazuh instances:

1. **Network Connectivity**:
   - Wazuh Manager API (`192.168.56.103:55000`): TCP test succeeded.
   - Wazuh Indexer (`127.0.0.1:9200`): TCP test succeeded.
2. **Wazuh Manager Status Endpoint**:
   - `GET http://127.0.0.1:8000/api/v1/wazuh/status` returned HTTP 200 with all core daemon statuses.
3. **Agents Telemetry Endpoint**:
   - `GET http://127.0.0.1:8000/api/v1/wazuh/agents` returned HTTP 200 with 2 active nodes (`vigilz` manager and `VIGIL-WIN11-HOST`).
4. **Alerts Retrieval Endpoint**:
   - `GET http://127.0.0.1:8000/api/v1/alerts?limit=2` returned HTTP 200 with live alert objects including rule metadata, agent context, timestamps, and event payloads.

---

## 5. Current File Map

```text
c:\Users\Izzat\Documents\Vigil\
├── .gitignore                          # Protects .env, venv, and cache
├── .env.example                        # Documented template for environment variables
├── VIGILANCE_PROJECT_CONTEXT.md        # Master project source of truth
├── WAZUH_INTEGRATION_UPDATE.md         # This context document
└── backend\
    ├── .env                            # Active backend secrets
    ├── requirement.txt                 # Dependencies (fastapi, uvicorn, requests, httpx, pydantic)
    └── app\
        ├── main.py                     # FastAPI application entrypoint
        ├── wazuh_config.py             # Backwards-compatible export layer
        ├── core\
        │   └── config.py               # Central Settings model with indexer exports
        ├── api\
        │   └── routes.py               # API routes (/status, /agents, /alerts)
        └── integrations\
            ├── wazuh.py                # Wazuh Manager API connector (httpx client)
            └── indexer.py              # Wazuh Indexer search client (httpx client)
```

---

## 6. Guidance for Phase 4 (AI-Agent Development)

With live security alerts now flowing through `GET /api/v1/alerts`:
1. **Preserve Confirmed Tech Stack**:
   - SIEM: Wazuh
   - Backend: Python + FastAPI
   - AI Orchestration: LangGraph
   - LLM: OpenAI API (Cloud) — **Do NOT switch to Ollama / local inference.**
   - Automation: n8n (human-in-the-loop approval gate)
   - Threat Framework: MITRE ATT&CK
2. **Immediate Next Goal**:
   - Install Phase 4 AI packages: `openai`, `langgraph`, `langchain-openai`.
   - Create `backend/app/agents/state.py` (Typed LangGraph state definition for alerts and investigations).
   - Build the **Initial Triage Agent** to evaluate and summarize live alerts from `GET /api/v1/alerts`.

