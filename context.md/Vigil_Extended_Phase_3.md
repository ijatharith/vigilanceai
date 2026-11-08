# Vigil --- Extended Phase 3 Development Handoff

> **Purpose:** This document is the authoritative handoff for the coding
> agent/IDE assistant working on Vigil's extended Phase 3. It describes
> the current project direction, intended architecture, implementation
> scope, expected deliverables, constraints, and validation criteria.
>
> **Project:** Vigil --- an AI-assisted SIEM and SOAR platform\
> **Current stage:** Phase 3 --- Backend Development and Wazuh
> Integration\
> **Next major stage:** Phase 4 --- AI Investigation Engine

------------------------------------------------------------------------

## 1. Agent Instructions

You are assisting with the development of **Vigil**, a university Final
Year Project (FYP). Work incrementally and preserve the architecture and
decisions in this document.

### Mandatory working rules

1.  **Inspect before changing.** Examine the existing repository, files,
    dependencies, environment variable names, and implemented endpoints
    before creating or replacing anything.
2.  **Do not overwrite working code blindly.** Reuse and extend existing
    modules. If the current implementation differs from this document,
    identify the difference and propose a safe migration.
3.  **Do not invent completed work.** Treat every item marked "planned"
    or "not verified" as incomplete until code, configuration, or test
    evidence confirms it.
4.  **Implement one milestone at a time.** Explain the files to be
    changed, make the smallest coherent implementation, run tests, and
    report results before moving on.
5.  **Do not expose secrets.** Never print, log, commit, or include API
    passwords, access tokens, database passwords, private keys, or
    `.env` contents in generated documentation or logs.
6.  **Do not put credentials in source code.** Load secrets from
    environment variables or a suitable secrets manager.
7.  **Prefer secure defaults.** Verify TLS certificates outside an
    isolated development lab. Keep Wazuh Indexer and Manager APIs
    private to the lab network.
8.  **Use typed, maintainable Python.** Add clear function names, type
    hints where useful, docstrings for non-obvious behavior, structured
    error handling, and tests.
9.  **Avoid premature AI implementation.** Phase 3 prepares reliable
    data and APIs. Do not introduce LangGraph agents, OpenAI calls, n8n
    workflows, or automated response actions unless explicitly asked to
    begin Phase 4.
10. **Ask before destructive operations.** Never drop databases, delete
    records, reset credentials, overwrite configuration, or change
    firewall/network settings without explaining the impact and
    obtaining approval.
11. **Keep the user informed.** At the end of each milestone, state what
    changed, what was tested, test results, remaining issues, and the
    exact next action.
12. **Do not claim a test passed unless it was actually run.** If the
    environment is unavailable, provide the command for the user to run
    and mark it "not verified."

### First action for the coding agent

Inspect the repository and report: - Existing directory tree. - Existing
`main.py`, Wazuh connector, configuration, routes, database files, and
requirements. - Actual environment variable names currently used. -
Which Phase 3 milestones are implemented and which are only planned. -
Any conflicts between the existing code and this handoff.

Do not generate a second backend architecture before this inspection.

------------------------------------------------------------------------

## 2. Project Overview

Vigil is an AI-assisted SIEM and SOAR platform built around Wazuh.

The system is intended to: - Collect and detect security events through
Wazuh. - Retrieve Wazuh alerts and endpoint information. - Store alert
and incident records in Vigil's own database. - Present security
information through a custom Vigil dashboard. - Later use controlled AI
agents to investigate alerts and produce recommendations. - Later apply
a deterministic policy layer before any permitted response action.

**Wazuh remains the SIEM and detection platform. Vigil does not replace
Wazuh.**

Vigil's backend acts as the integration and application layer between
Wazuh, Vigil's database, the future frontend, and (in Phase 4) the AI
investigation engine.

### Key safety principle

An AI model must never receive unrestricted shell access or permission
to execute arbitrary commands. Any future response action must pass
through a deterministic policy gateway, use an allowlist, apply least
privilege, be audited, and require human approval for disruptive or
high-impact actions.

------------------------------------------------------------------------

## 3. Confirmed Project Decisions

  -----------------------------------------------------------------------
  Area                                Decision
  ----------------------------------- -----------------------------------
  Project name                        Vigil

  SIEM                                Wazuh

  Host OS                             Windows 11

  Development machine RAM             32 GB

  CPU                                 Intel Core Ultra 7 258V

  Virtualization                      VirtualBox

  Wazuh host                          Ubuntu Server VM

  Wazuh deployment                    All-in-one Manager, Indexer and
                                      Dashboard for the lab

  Backend language                    Python

  Backend framework                   FastAPI

  HTTP client                         HTTPX

  Database                            PostgreSQL

  ORM                                 SQLAlchemy

  Frontend direction                  React + TypeScript

  AI deployment                       OpenAI API (cloud), not local
                                      Ollama

  Multi-agent framework               LangGraph

  Workflow automation                 n8n, planned for later

  IDE                                 Visual Studio Code

  Phase 3 goal                        Reliable backend, Wazuh
                                      integration, alert ingestion,
                                      persistence and dashboard APIs
  -----------------------------------------------------------------------

### Suggested local resource allocation

The current lab starting point is: - Wazuh Ubuntu VM: approximately 12
GB RAM, 4 vCPUs, dynamically allocated 120 GB disk. - Vigil backend and
PostgreSQL: run on Windows during initial development. - Do not allocate
all host memory to VirtualBox. Adjust based on actual host and VM memory
pressure.

These are starting recommendations, not fixed requirements.

------------------------------------------------------------------------

## 4. Target Architecture

``` text
Windows 11 Development Host
|
+-- VS Code
|   +-- Vigil FastAPI backend
|   +-- PostgreSQL database (local Windows installation)
|   +-- Future React + TypeScript frontend
|
+-- VirtualBox
    |
    +-- Ubuntu Server: Wazuh all-in-one
        +-- Wazuh Manager API (normally TCP 55000)
        +-- Wazuh Agent communication (normally TCP 1514)
        +-- Agent registration (normally TCP 1515)
        +-- Wazuh Indexer API (normally TCP 9200)
        +-- Wazuh Dashboard (normally TCP 443)
        |
        +-- Windows endpoint agent
        +-- Optional Linux endpoint agent
```

### Data flow

``` text
Windows/Linux endpoints
        |
        v
Wazuh Agents
        |
        v
Wazuh Manager and detection rules
        |
        v
Wazuh Indexer (alert documents)
        |
        v
Vigil FastAPI integration layer
        |
        +------> Wazuh Manager API (agent/manager information)
        |
        +------> Wazuh Indexer API (alert search)
        |
        v
Alert normalization and ingestion service
        |
        v
PostgreSQL
        |
        v
Vigil REST API
        |
        v
Future React dashboard / Phase 4 AI investigation engine
```

### Wazuh interface responsibilities

  ------------------------------------------------------------------------
  Interface                             Typical port Use
  --------------------- ---------------------------- ---------------------
  Wazuh Manager REST                       55000/TCP Manager status,
  API                                                agents and management
                                                     operations

  Wazuh Indexer REST                        9200/TCP Search indexed alert
  API                                                documents

  Agent communication                       1514/TCP Agent-to-manager
                                                     communication

  Agent registration                        1515/TCP Agent enrollment

  Wazuh Dashboard                            443/TCP Human-facing Wazuh
                                                     interface
  ------------------------------------------------------------------------

Ports and endpoints must be confirmed against the installed Wazuh
version and actual configuration. Do not assume that a port is reachable
merely because a service is running.

------------------------------------------------------------------------

## 5. Phase 3 Scope and Milestones

Phase 3 is divided into four main milestones.

### 3.1 --- Wazuh Manager API integration

**Objective:** Vigil can authenticate to the Wazuh Manager API and
retrieve basic manager and agent information.

Required functions: - Authenticate using the Wazuh Manager API. - Obtain
and use the API token. - Retrieve manager status. - Retrieve registered
agents. - Handle expired/invalid credentials and network errors. - Avoid
exposing tokens in logs or responses.

Suggested endpoints in Vigil: - `GET /api/v1/wazuh/status` -
`GET /api/v1/wazuh/agents`

Acceptance criteria: - The backend starts. - Wazuh API connectivity is
verified from the Windows development host. - Manager status is returned
through Vigil. - Agent list is returned through Vigil. - Invalid
credentials produce a safe, useful error.

### 3.2 --- Wazuh Indexer alert ingestion

**Objective:** Vigil can search actual alert documents indexed by Wazuh.

The Wazuh Indexer is separate from the Wazuh Manager API. Use the
Indexer API to search `wazuh-alerts-*` indices.

Required capabilities: - Authenticate to the Indexer using a dedicated
account with only the permissions required for reading alert indices. -
Search alerts by time range. - Sort newest first. - Support bounded page
size and pagination. - Filter by agent, rule level, rule ID and time
range as practical. - Return the Wazuh alert document with its source
fields intact. - Handle empty results, authentication errors, TLS
errors, timeouts and index-not-found errors. - Do not assume all Wazuh
installations have exactly the same index mappings. Inspect mappings or
verify the timestamp field before finalizing queries.

Suggested endpoint: - `GET /api/v1/alerts`

Initial default query may search the last 24 hours and return a bounded
number of alerts. Enforce a safe maximum page size (for example, 100)
unless a documented reason requires otherwise.

**Indexer query considerations:** - Typical index pattern:
`wazuh-alerts-*`. - Typical timestamp field: `timestamp`; verify against
the installed index mapping. - Typical alert document fields include
`rule`, `agent`, `manager`, `timestamp`, `location`, `decoder`,
`full_log` and related event details, but field availability varies. -
The Indexer document `_id` and `_index` are metadata from the search
hit, not necessarily fields inside `_source`. - Preserve `_id` as the
stable source alert identifier and `_index` as source-index metadata.

### 3.3 --- PostgreSQL persistence

**Objective:** Store imported Wazuh alert records in Vigil's own
database.

Initial database: - Database name: `vigil_db` - Dedicated application
database user: `vigil_user` - Typical local connection:
`localhost:5432` - ORM: SQLAlchemy - Driver: psycopg 3
(`psycopg[binary]`) for the initial Windows development setup.

Required initial table: - `alerts`

Suggested fields: - Internal primary key. - `source` (e.g. `wazuh`). -
`alert_id` (Wazuh Indexer hit `_id`). - `source_index` (Wazuh Indexer
hit `_index`). - `timestamp` (prefer timezone-aware database datetime
when parsing is reliable). - `rule_id`. - `rule_description`. -
`severity` / Wazuh rule level. - `agent_id`. - `agent_name`. -
`full_event` (JSON/JSONB containing the original Wazuh `_source`
document). - `ingested_at` (database timestamp).

Constraints: - Unique constraint on `(source, alert_id)` or an
equivalent stable unique key. - Use database-level conflict-safe
insertion / upsert for concurrent or repeated ingestion. - Do not rely
only on "SELECT then INSERT" for deduplication; concurrent workers can
race. - Preserve original event data for future AI investigation and
audit. - Never silently discard the original event fields.

Database implementation requirements: - Use SQLAlchemy models. - Use
dependency-injected database sessions for API routes. - Add transaction
rollback on failure. - Add Alembic migrations before schema changes
become frequent or before a shared deployment. - Do not drop or recreate
the database to fix migration issues without user approval.

Suggested database endpoints: - `GET /api/v1/incidents` (initially may
return stored alert records; clearly label them as alerts until incident
correlation is implemented). - `GET /api/v1/alerts/stored` (optional
clearer endpoint name).

**Important terminology:** An imported Wazuh alert is not automatically
a confirmed incident. Phase 3 stores alert records. Phase 4 or a later
correlation service may group related alerts into incidents.

### 3.4 --- Dashboard APIs and backend hardening

**Objective:** Expose normalized information for the future React
dashboard.

Suggested endpoints: - `GET /api/v1/dashboard/stats` -
`GET /api/v1/wazuh/status` - `GET /api/v1/wazuh/agents` -
`GET /api/v1/alerts` - `POST /api/v1/alerts/sync` -
`GET /api/v1/incidents` (or `GET /api/v1/alerts/stored`)

Initial dashboard statistics: - Total stored alerts. - Counts by Wazuh
rule level group. - Recent alerts. - Agent counts and agent statuses
(from Wazuh Manager API). - Time window used for statistics.

Severity groupings should be clearly documented and configurable. One
possible initial grouping based on Wazuh rule level is: - Critical:
level 12--15. - High: level 10--11. - Medium: level 7--9. - Low: level
0--6.

These are display groupings only. They are not a complete risk
assessment and must not be presented as a definitive business-impact
score.

Hardening requirements: - Vigil API authentication before exposing it
beyond localhost. - Role-based authorization where appropriate. - Input
validation and bounded query parameters. - Safe error messages; detailed
stack traces only in protected server logs. - Structured logging with
secrets and tokens redacted. - TLS verification enabled outside the
isolated lab. - Read-only Wazuh permissions for read operations. - Audit
logging for security-relevant user and system actions. - Tests for
successful and failed requests. - CORS restricted to the actual frontend
origin when frontend integration begins.

------------------------------------------------------------------------

## 6. Important Corrections and Implementation Notes

Some starter snippets from earlier guidance were intentionally minimal.
The coding agent must verify and improve them rather than copy them
blindly.

### 6.1 Configuration naming consistency

Earlier examples used different names in different files, such as: -
`WAZUH_HOST` versus `WAZUH_API_URL`. - `WAZUH_USERNAME` versus
`WAZUH_API_USERNAME`. - `WAZUH_PASSWORD` versus `WAZUH_API_PASSWORD`.

Choose one canonical naming convention and use it consistently across
`.env.example`, settings/configuration, connectors, tests and
documentation.

Recommended names:

``` env
WAZUH_API_URL=https://YOUR_WAZUH_HOST:55000
WAZUH_API_USERNAME=YOUR_API_USERNAME
WAZUH_API_PASSWORD=YOUR_API_PASSWORD

WAZUH_INDEXER_URL=https://YOUR_WAZUH_HOST:9200
WAZUH_INDEXER_USERNAME=YOUR_INDEXER_USERNAME
WAZUH_INDEXER_PASSWORD=YOUR_INDEXER_PASSWORD

WAZUH_VERIFY_SSL=true

DATABASE_URL=postgresql+psycopg://vigil_user:URL_ENCODED_PASSWORD@localhost:5432/vigil_db
```

For a local self-signed lab certificate only, the user may temporarily
set `WAZUH_VERIFY_SSL=false`. Make this limitation explicit and never
use it as a production default.

Do not create a second configuration system if the repository already
has a working one. Migrate carefully.

### 6.2 Wazuh Manager API authentication

Use the installed Wazuh version's documented authentication endpoint and
token response format. Verify the actual response structure. Do not
assume the response JSON shape without checking it.

Do not obtain a new token unnecessarily for every single operation if a
safe token cache can be implemented. If token caching is added: - Store
tokens only in memory. - Never log them. - Handle expiration and
authentication failure. - Refresh once on an authentication-expired
response, not in an infinite retry loop.

### 6.3 Indexer authentication and permissions

Use a dedicated Indexer read account. Do not assume the Manager API user
can authenticate to the Indexer. They are separate security components.

Verify: - Indexer URL and certificate. - Account credentials. - Index
permissions for the required `wazuh-alerts-*` pattern. - Search response
shape. - Actual timestamp mapping.

### 6.4 Correct handling of Indexer search hits

A search hit generally has metadata similar to:

``` json
{
  "_index": "wazuh-alerts-4.x-YYYY.MM.DD",
  "_id": "stable-indexer-document-id",
  "_source": {
    "timestamp": "2026-10-19T14:00:00.000Z",
    "rule": {
      "id": "554",
      "description": "Example alert",
      "level": 5
    },
    "agent": {
      "id": "001",
      "name": "WINDOWS-ENDPOINT"
    }
  }
}
```

The alert identifier should be taken from the hit's `_id`, not assumed
to exist inside `_source`.

Preserve `_source` as the original event document and store `_index`
separately.

### 6.5 Error handling

Do not return raw exception strings to public API clients if they may
reveal: - Credentials or authorization headers. - Internal IPs or
hostnames. - File paths. - Database connection strings. - Stack traces.

Return a safe message and a request/correlation ID. Log diagnostic
details server-side with secrets redacted.

### 6.6 Database deduplication

Do not depend exclusively on this pattern:

``` python
existing = db.query(Alert).filter(...).first()
if not existing:
    db.add(Alert(...))
```

It can race if two sync operations run concurrently. Use a unique
database constraint and a PostgreSQL conflict-safe insert/upsert
strategy. Report inserted, updated and skipped counts accurately.

### 6.7 Ingestion semantics

The first implementation can use a manually triggered sync endpoint. Do
not create an uncontrolled background polling loop.

When incremental ingestion is implemented: - Use a persisted watermark
or a carefully defined time overlap. - Include a small overlap window to
avoid missing alerts near a sync boundary. - Deduplicate by stable
source identity. - Handle late-arriving alerts. - Record the last
successful sync time and sync outcome. - Do not mark a sync successful
if the database transaction failed.

------------------------------------------------------------------------

## 7. Suggested Repository Structure

Inspect the current repository first. The following is a target
structure, not permission to duplicate existing files.

``` text
Vigil/
|
+-- backend/
|   +-- app/
|   |   +-- main.py
|   |   +-- api/
|   |   |   +-- routes/
|   |   |   |   +-- wazuh.py
|   |   |   |   +-- alerts.py
|   |   |   |   +-- dashboard.py
|   |   |   +-- dependencies.py
|   |   +-- core/
|   |   |   +-- config.py
|   |   |   +-- logging.py
|   |   +-- integrations/
|   |   |   +-- wazuh_manager.py
|   |   |   +-- wazuh_indexer.py
|   |   +-- database/
|   |   |   +-- connection.py
|   |   |   +-- models/
|   |   |   |   +-- alert.py
|   |   |   +-- repositories/
|   |   +-- schemas/
|   |   |   +-- alert.py
|   |   +-- services/
|   |   |   +-- alert_ingestion.py
|   |   |   +-- dashboard.py
|   |   +-- tests/
|   +-- alembic/
|   +-- alembic.ini
|   +-- requirements.txt
|   +-- .env.example
|   +-- .gitignore
|
+-- frontend/                  # Later frontend work
+-- infrastructure/
|   +-- wazuh/
|   +-- docker/
+-- documentation/
|   +-- architecture/
|   +-- api/
|   +-- testing/
+-- tests/
+-- README.md
```

The agent may retain a simpler structure if the existing repository
already uses it. Avoid unnecessary refactoring during the initial
integration.

------------------------------------------------------------------------

## 8. API Contract --- Initial Target

Use a consistent prefix: `/api/v1`.

  ---------------------------------------------------------------------------
  Method                  Path                        Purpose
  ----------------------- --------------------------- -----------------------
  GET                     `/`                         Basic application
                                                      health

  GET                     `/health`                   Backend health check

  GET                     `/api/v1/wazuh/status`      Wazuh Manager status

  GET                     `/api/v1/wazuh/agents`      Wazuh agent inventory

  GET                     `/api/v1/alerts`            Search Wazuh Indexer
                                                      alerts

  POST                    `/api/v1/alerts/sync`       Import a bounded set of
                                                      alerts

  GET                     `/api/v1/incidents`         Retrieve stored
                                                      records; label as
                                                      alerts until correlated

  GET                     `/api/v1/dashboard/stats`   Dashboard summary
                                                      statistics
  ---------------------------------------------------------------------------

### API response conventions

Use consistent response shapes. Example:

``` json
{
  "success": true,
  "data": [],
  "meta": {
    "count": 0
  }
}
```

For errors, return an appropriate HTTP status and a safe response:

``` json
{
  "success": false,
  "error": {
    "code": "WAZUH_INDEXER_UNAVAILABLE",
    "message": "The Wazuh alert service is temporarily unavailable."
  }
}
```

Do not expose credentials, tokens, stack traces or raw internal
exception details.

------------------------------------------------------------------------

## 9. Environment and Dependency Management

### Python environment

Use a project virtual environment on Windows:

``` powershell
cd C:\Vigil\backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, use a process-scoped policy change for
the current terminal only, rather than changing machine-wide execution
policy.

### Dependencies

Likely dependencies for Phase 3 include:

``` text
fastapi
uvicorn[standard]
httpx
python-dotenv
pydantic-settings
sqlalchemy
psycopg[binary]
alembic
pytest
pytest-asyncio
```

The coding agent must inspect the existing environment and choose
compatible versions. Pin or lock dependencies in a repeatable way after
the implementation stabilizes. Do not blindly replace the current
dependency file with an uncontrolled `pip freeze` output.

### Git safety

Ensure `.gitignore` includes at least:

``` gitignore
venv/
.venv/
__pycache__/
*.py[cod]
.pytest_cache/
.env
.env.*
!.env.example
```

Before every commit, check:

``` powershell
git status
git diff --check
```

Never commit `.env`, generated credentials, certificates, private keys,
database dumps or real sensitive logs.

------------------------------------------------------------------------

## 10. Testing Strategy

Testing is required for each milestone.

### Unit tests

Test: - Configuration validation. - Indexer response parsing. -
Extraction of `_id`, `_index` and `_source`. - Alert normalization. -
Severity grouping. - Deduplication behavior. - Database transaction
rollback. - Safe error mapping.

### Integration tests

Test against a controlled lab: - Wazuh Manager API authentication. -
Manager status retrieval. - Agent list retrieval. - Indexer search
against `wazuh-alerts-*`. - Database insert and retrieval. - Repeated
sync does not create duplicate records.

Do not make automated tests depend on a live Wazuh instance by default.
Mock HTTP calls for unit tests and mark real-lab integration tests
separately.

### End-to-end acceptance test

1.  Generate a controlled test event on the Windows endpoint, such as
    creating/modifying a file in the dedicated FIM test folder.
2.  Verify Wazuh produces an alert.
3.  Verify the alert appears in the Indexer.
4.  Call Vigil's alert search endpoint.
5.  Trigger synchronization.
6.  Verify the record exists in PostgreSQL.
7.  Call the stored-alert endpoint.
8.  Verify dashboard statistics reflect the stored record.
9.  Repeat synchronization and verify no duplicate record is created.

Do not fabricate successful test output. Capture actual results and
timestamps.

------------------------------------------------------------------------

## 11. Security Requirements

Phase 3 is a security application, so security must be built in from the
beginning.

-   Use a dedicated read-only Wazuh integration identity for read
    operations.
-   Keep Indexer port 9200 and Manager API port 55000 restricted to the
    lab network.
-   Do not expose Wazuh services to the public internet.
-   Use TLS certificate verification outside the isolated lab.
-   Keep secrets in `.env` for local development and exclude it from
    Git.
-   Redact authorization headers and tokens from logs.
-   Validate and bound all user-supplied query parameters.
-   Protect sync endpoints from unauthenticated use before network
    exposure.
-   Use least-privilege PostgreSQL credentials.
-   Avoid storing unnecessary personal data in alert records.
-   Treat log messages and alert fields as untrusted data.
-   Do not execute commands contained in alerts or logs.
-   Do not let Wazuh alert content become trusted instructions for
    future AI agents.

### Future AI safety boundary

When Phase 4 begins, alert content must be treated as untrusted
evidence. It may contain attacker-controlled strings, including
prompt-injection attempts. AI agents must have constrained tools and
read-only investigation access by default. Any response action requires
deterministic policy validation and appropriate human approval.

------------------------------------------------------------------------

## 12. Phase 3 Definition of Done

Phase 3 is not complete merely because FastAPI starts. The following
must be demonstrated.

### Milestone 3.1

-   [ ] FastAPI starts reliably.
-   [ ] Wazuh Manager API authentication works.
-   [ ] Manager status endpoint works.
-   [ ] Agent inventory endpoint works.
-   [ ] Failure cases return safe errors.

### Milestone 3.2

-   [ ] Windows host can reach the Wazuh Indexer through the intended
    lab network.
-   [ ] Indexer authentication works.
-   [ ] Actual alert documents are retrieved.
-   [ ] `_id`, `_index` and `_source` are handled correctly.
-   [ ] Time filtering and bounded result size work.
-   [ ] Empty results and Indexer errors are handled.

### Milestone 3.3

-   [ ] PostgreSQL database and least-privilege application user exist.
-   [ ] SQLAlchemy connection works.
-   [ ] Alert table and unique source identity exist.
-   [ ] Original alert document is retained.
-   [ ] Alerts can be inserted and retrieved.
-   [ ] Repeated/concurrent synchronization does not create duplicates.
-   [ ] Database errors roll back safely.

### Milestone 3.4

-   [ ] Dashboard statistics endpoint works.
-   [ ] Agent and alert information are available through consistent
    APIs.
-   [ ] API validation and safe error handling exist.
-   [ ] Credentials are not committed or logged.
-   [ ] Unit tests pass.
-   [ ] End-to-end FIM alert test passes.
-   [ ] Developer documentation explains how to run the backend.

Only mark a checkbox complete when supported by implementation or test
evidence.

------------------------------------------------------------------------

## 13. Phase 4 Boundary --- Do Not Implement Yet

The next phase is the AI Investigation Engine. The selected architecture
is:

-   OpenAI API for cloud model inference.
-   LangGraph for multi-agent orchestration.
-   Multi-agent design, initially:
    1.  Initial Triage Agent.
    2.  Threat Hunting Agent.
-   Controlled tools to query Vigil/Wazuh data.
-   Threat intelligence enrichment.
-   MITRE ATT&CK mapping.
-   Structured investigation reports.
-   n8n for workflow automation when appropriate.

Do not implement these during Phase 3 unless the user explicitly changes
the stage.

Phase 3 must first provide dependable alert retrieval, persistence and
APIs for Phase 4 to consume.

------------------------------------------------------------------------

## 14. How the Agent Should Report Progress

After each implementation milestone, provide a concise report in this
format:

``` text
Milestone:
Implemented:
Files created/modified:
Dependencies added/changed:
Tests run:
Actual test results:
Security considerations:
Known limitations:
Next recommended step:
```

If blocked, report: - Exact command executed. - Sanitized error
message. - Relevant configuration key names (never secret values). -
What has already been checked. - The smallest next diagnostic action.

Do not ask the user to repeat information already present in this
document or the repository.

------------------------------------------------------------------------

## 15. Immediate Next Task

**Start with a repository audit, then implement or repair Stage 3.2 ---
Wazuh Indexer alert ingestion.**

The immediate sequence is:

1.  Inspect the existing Vigil backend.
2.  Confirm the canonical environment variable names and current Wazuh
    Manager connector.
3.  Confirm the actual Wazuh Indexer host, port, TLS certificate
    behavior and read credentials are configured by the user.
4.  Test connectivity without printing secrets.
5.  Inspect the actual alert index mapping and sample response shape.
6.  Implement the Indexer connector with bounded search and correct
    `_id` / `_index` / `_source` handling.
7.  Add or update `GET /api/v1/alerts`.
8.  Add unit tests using mocked Indexer responses.
9.  Report the result and wait for confirmation before proceeding to
    database work if the user wants milestone-by-milestone guidance.

**Do not assume that the example IP `192.168.56.103` is the user's
current Wazuh IP. It is only an example from previous development
guidance. Confirm the actual host-only address.**

------------------------------------------------------------------------

## 16. Reference Documentation

Use official documentation as the primary technical reference and verify
details against the installed versions:

-   Wazuh documentation: https://documentation.wazuh.com/current/
-   Wazuh REST API:
    https://documentation.wazuh.com/current/user-manual/api/
-   Wazuh Indexer:
    https://documentation.wazuh.com/current/user-manual/wazuh-indexer/
-   FastAPI: https://fastapi.tiangolo.com/
-   HTTPX: https://www.python-httpx.org/
-   SQLAlchemy: https://docs.sqlalchemy.org/
-   PostgreSQL: https://www.postgresql.org/docs/
-   Alembic: https://alembic.sqlalchemy.org/

------------------------------------------------------------------------

**End of Vigil Extended Phase 3 Agent Handoff**

This document describes the intended implementation and acceptance
criteria. It does not claim that any unverified code, service,
connection, or milestone is already complete.
