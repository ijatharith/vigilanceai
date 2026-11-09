# Vigilance dashboard

React + TypeScript + Tailwind (Vite) analyst dashboard for Vigilance. It talks only to the
Vigilance FastAPI backend (`/api/v1`); the backend talks to Wazuh, PostgreSQL and the VIGIL
agents service. No secret ever reaches the browser.

```
Browser ──/api──▶ Vite proxy ──▶ FastAPI :8000 ──▶ Wazuh Manager / Indexer
                                              ├──▶ PostgreSQL (alerts, cases, audit log)
                                              └──▶ VIGIL agents :8100 (+ worker)
```

## Run everything (4 PowerShell windows)

```powershell
# 1. Agents API   (agents/vigil-agents)
.\.venv\Scripts\Activate.ps1
$env:VIGIL_API_TOKEN = '<same long random value as VIGIL_AGENTS_TOKEN in backend/.env>'
vigil serve --port 8100

# 2. Agents worker (same folder, same VIGIL_API_TOKEN)
vigil worker

# 3. Backend      (backend)
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000

# 4. Dashboard    (frontend)
npm install
npm run dev        # http://localhost:5173
```

Set `VIGILANCE_API_URL` to point the dev proxy at a backend other than `http://127.0.0.1:8000`.

## Pages (routes from the dashboard design spec)

| Route | Data source |
|-------|-------------|
| `/dashboard` | `/dashboard/stats`, `/alerts/stored`, `/ai/investigations`, `/wazuh/agents`, latest report |
| `/alerts` | `/alerts/stored` (PostgreSQL), `/alerts` (live Indexer), `/alerts/sync`, investigate actions |
| `/incidents`, `/incidents/:caseId` | `/ai/investigations`, status/report polling, `/review` |
| `/ai-analyst` | `/ai/agents`, `/ai/health`, submit from stored alert, JSON or labelled sample |
| `/soar` | `/ai/recommendations`; approvals and execution are shown as planned (Phase 5) |
| `/endpoints` | `/wazuh/agents` |
| `/audit-logs` | `/audit-logs` (read-only) |
| `/settings` | `/health`, `/settings/integrations` (secrets reported as set/missing only) |

## Honesty rules applied

- Every panel says where its data comes from; sample alerts are labelled as sample.
- Service status comes from live backend probes; nothing is shown as connected unless it is.
- AI output is labelled AI-generated and unverified; recommendations are labelled "not executed".
- Raw events and agent output are rendered as text, never HTML.
- The agents are read-only, and analyst review decisions are recorded in the audit log without triggering any action.
