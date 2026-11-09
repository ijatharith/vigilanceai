import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../components/icons";
import { BulletList, CaseLink, InvestigationProgress, SafetyBadges, useInvestigation } from "../components/investigation";
import {
  AssessmentBadge,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingRows,
  Mono,
  Notice,
  PageHeader,
  Panel,
  RunStatusBadge,
  SectionLabel,
  SeverityBadge,
  SourceTag,
  Tabs,
  TextInput,
} from "../components/ui";
import { SAMPLE_ALERTS } from "../data/sampleAlerts";
import { ApiError, post, qs } from "../lib/api";
import { useApp } from "../lib/appContext";
import { formatDateTime, formatRelative } from "../lib/format";
import type { AgentInfo, CaseRow, StoredAlert, Submission } from "../lib/types";
import { useApi } from "../lib/useApi";

type Mode = "stored" | "json" | "sample";

function AgentRoster() {
  const agents = useApi<{ agents: AgentInfo[]; plugins: unknown[] }>("/ai/agents");
  return (
    <Panel title="VIGIL agents" aside={agents.data ? <SourceTag kind="live">Live</SourceTag> : undefined}>
      {agents.error ? (
        <ErrorState error={agents.error} onRetry={agents.reload} title="AI unavailable" />
      ) : !agents.settled ? (
        <LoadingRows rows={4} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {agents.data?.agents.map((a) => (
            <li key={a.agent_id} className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold">{a.display_name}</span>
                {a.agent_id === "orchestrator" && <Badge tone="primary">Entry point</Badge>}
              </div>
              <span className="text-xs text-muted">{a.purpose}</span>
              <Mono className="text-[11px] text-subtle">
                {a.provider === "offline" || !a.provider ? "Offline (deterministic)" : `${a.provider} · ${a.model_id}`}
              </Mono>
              <div className="flex flex-wrap gap-1">
                {a.tools.map((t) => (
                  <span key={t} className="rounded bg-bg px-1.5 py-0.5 font-mono text-[10.5px] text-muted">
                    {t}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-[11.5px] text-subtle">All tools are read-only. Model assignments are changed with <Mono>vigil model select</Mono>; keys never leave the agents service.</p>
    </Panel>
  );
}

function ActiveRun({ caseId }: { caseId: string }) {
  const { status, report, finished, reportMissing } = useInvestigation(caseId);
  const r = report.data;
  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          Investigation <CaseLink caseId={caseId} />
        </span>
      }
      aside={<RunStatusBadge status={r?.status ?? status.data?.job?.status ?? status.data?.status ?? "queued"} />}
    >
      {status.error && <ErrorState error={status.error} onRetry={status.reload} />}
      <InvestigationProgress status={status.data} reportReady={!!status.data?.report_ready} />
      {reportMissing && <ErrorState error={new ApiError("REPORT_UNAVAILABLE", "The investigation ended without a report.", 409)} title="Investigation failed" />}
      {r && (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            <AssessmentBadge value={r.security_assessment} />
            <SafetyBadges report={r} />
          </div>
          <p className="m-0 text-[14px] leading-relaxed">{r.executive_summary}</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <SectionLabel>Missing information</SectionLabel>
              <BulletList items={r.unresolved_questions} empty="None reported." marker="?" />
            </div>
            <div className="flex flex-col gap-2">
              <SectionLabel>Recommended next steps (not executed)</SectionLabel>
              <BulletList items={r.next_steps} empty="None proposed." marker="→" />
            </div>
          </div>
          <Link to={`/incidents/${caseId}`} className="inline-flex items-center gap-1.5 text-[13px] text-accent no-underline hover:underline">
            Open full case with evidence and review <Icon.ArrowRight size={14} />
          </Link>
        </div>
      )}
      {!finished && <span className="text-xs text-subtle">Runs take from a few seconds (offline mode) to a few minutes (cloud model). You can leave this page; the case keeps running.</span>}
    </Panel>
  );
}

export default function AiAnalyst() {
  const { notify, reloadStats } = useApp();
  const [mode, setMode] = useState<Mode>("stored");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<StoredAlert | null>(null);
  const [json, setJson] = useState('{\n  "alert_id": "manual-001",\n  "description": "Describe the alert",\n  "ip": "203.0.113.8",\n  "host": "ubuntu-server-01",\n  "observed_at": "2026-11-09T10:00:00Z"\n}');
  const [sample, setSample] = useState(SAMPLE_ALERTS[0].id);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const alerts = useApi<StoredAlert[]>(mode === "stored" ? `/alerts/stored${qs({ q: debounced, limit: 8 })}` : null);
  const history = useApi<CaseRow[]>("/ai/investigations?limit=15", { interval: 10_000 });
  const health = useApi<{ status: string; connector_mode: string }>("/ai/health", { interval: 30_000 });

  let jsonError: string | null = null;
  let parsed: Record<string, unknown> | null = null;
  if (mode === "json") {
    try {
      const v = JSON.parse(json);
      if (!v || typeof v !== "object" || Array.isArray(v) || !Object.keys(v).length) jsonError = "Must be a non-empty JSON object.";
      else parsed = v;
    } catch {
      jsonError = "Not valid JSON.";
    }
  }

  const canSubmit = !busy && !health.error && (mode === "stored" ? !!picked : mode === "json" ? !!parsed : true);

  const submit = async () => {
    setBusy(true);
    try {
      let res;
      if (mode === "stored" && picked) res = await post<Submission>(`/ai/investigations/from-alert/${encodeURIComponent(picked.alert_id)}`);
      else if (mode === "json" && parsed) res = await post<Submission>("/ai/investigations", { alert: parsed, origin: "manual" });
      else res = await post<Submission>("/ai/investigations", { alert: SAMPLE_ALERTS.find((s) => s.id === sample)!.alert, origin: "manual" });
      setActive(res.data.case_id);
      notify({ tone: "ok", title: res.data.created ? "Investigation queued" : "Existing case reopened", body: res.data.case_id });
      history.reload();
      reloadStats();
    } catch (e) {
      const err = e as ApiError;
      notify({ tone: "fail", title: "Could not start the investigation", body: `${err.message} (${err.code})` });
    } finally {
      setBusy(false);
    }
  };

  const connectorMode = health.data?.connector_mode;

  return (
    <>
      <PageHeader
        title="AI Analyst"
        subtitle="Hand an alert to the VIGIL Orchestrator. It routes the case to the Triage, Malware or Hunter specialist, which gather evidence with bounded read-only tools and return a validated report."
        tags={
          <>
            <Badge tone="neutral">
              <Icon.Lock size={11} /> READ-ONLY AGENTS
            </Badge>
            {health.error ? (
              <Badge tone="fail">AI service unavailable</Badge>
            ) : connectorMode ? (
              <Badge tone={connectorMode === "mock" ? "warn" : "ok"}>Evidence source: {connectorMode === "mock" ? "mock (simulated records)" : connectorMode}</Badge>
            ) : null}
          </>
        }
      />

      {health.error && <ErrorState error={health.error} onRetry={health.reload} title="AI unavailable" />}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(240px,1fr)_minmax(0,2.4fr)_minmax(280px,1.2fr)]">
        {/* History */}
        <Panel title="Recent cases">
          {history.error ? (
            <ErrorState error={history.error} onRetry={history.reload} />
          ) : !history.settled ? (
            <LoadingRows rows={5} />
          ) : history.data?.length ? (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {history.data.map((c) => (
                <li key={c.case_id}>
                  <button
                    type="button"
                    onClick={() => setActive(c.case_id)}
                    className={`flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg border-0 px-2.5 py-2 text-left ${active === c.case_id ? "bg-elevated" : "bg-transparent hover:bg-hover/50"}`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <Mono className="text-[11.5px] text-accent">{c.case_id}</Mono>
                      <RunStatusBadge status={c.status} />
                    </span>
                    <span className="line-clamp-1 text-[12.5px] text-fg">{c.alert_summary ?? "Manual alert"}</span>
                    <span className="text-[11px] text-subtle">{formatRelative(c.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-subtle">No cases yet.</p>
          )}
        </Panel>

        {/* Workspace */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="New investigation">
            <Tabs<Mode>
              value={mode}
              onChange={setMode}
              tabs={[
                { value: "stored", label: "Stored Wazuh alert" },
                { value: "json", label: "Paste alert JSON" },
                { value: "sample", label: "Sample alert" },
              ]}
            />

            {mode === "stored" && (
              <div className="flex flex-col gap-3">
                <TextInput label="Find a stored alert" placeholder="Search description, rule ID or endpoint" value={search} onChange={(e) => setSearch(e.target.value)} />
                {alerts.error ? (
                  <ErrorState error={alerts.error} onRetry={alerts.reload} />
                ) : !alerts.settled ? (
                  <LoadingRows rows={4} />
                ) : alerts.data?.length ? (
                  <ul className="m-0 flex max-h-80 list-none flex-col gap-1 overflow-y-auto p-0" role="listbox" aria-label="Stored alerts">
                    {alerts.data.map((a) => (
                      <li key={a.alert_id} role="option" aria-selected={picked?.alert_id === a.alert_id}>
                        <button
                          type="button"
                          onClick={() => setPicked(a)}
                          className={`flex w-full cursor-pointer flex-wrap items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] text-fg ${
                            picked?.alert_id === a.alert_id ? "border-primary bg-primary-soft/20" : "border-line bg-transparent hover:bg-hover/50"
                          }`}
                        >
                          <SeverityBadge level={a.level} />
                          <span className="min-w-0 flex-1 truncate">{a.rule_description}</span>
                          <span className="text-xs text-muted">{a.agent_name}</span>
                          <Mono className="text-[11px] text-subtle">{formatDateTime(a.timestamp)}</Mono>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No stored alerts found">
                    Sync alerts on the <Link to="/alerts" className="text-accent">Security Alerts</Link> page first.
                  </EmptyState>
                )}
              </div>
            )}

            {mode === "json" && (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Alert object (Wazuh _source or a simple alert; max 256 KiB)
                  <textarea
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                    rows={10}
                    spellCheck={false}
                    className="rounded-lg border border-line bg-bg p-3 font-mono text-[12px] text-fg"
                  />
                </label>
                {jsonError ? <span className="text-xs text-fail">{jsonError}</span> : <span className="text-xs text-subtle">Timestamps must be timezone-aware ISO 8601. The text is treated as untrusted evidence, never as instructions.</span>}
              </div>
            )}

            {mode === "sample" && (
              <div className="flex flex-col gap-3">
                <Notice tone="warn" title="Sample data">
                  These are fictional fixture alerts from the agents package (documentation IP ranges). Use them to demo routing to each specialist.
                </Notice>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SAMPLE_ALERTS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSample(s.id)}
                      aria-pressed={sample === s.id}
                      className={`flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-3 text-left text-fg ${sample === s.id ? "border-primary bg-primary-soft/20" : "border-line bg-transparent hover:bg-hover/50"}`}
                    >
                      <span className="text-[13px] font-semibold">{s.label}</span>
                      <span className="text-xs text-muted">Expected route: {s.routesTo}</span>
                      <Mono className="text-[11px] text-subtle">{String(s.alert.alert_id)}</Mono>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-xs text-subtle">
                {mode === "stored" && picked ? <>Selected <Mono>{picked.alert_id}</Mono></> : "The Orchestrator decides which specialists to run."}
              </span>
              <Button variant="primary" icon={<Icon.Sparkle size={15} />} loading={busy} disabled={!canSubmit} onClick={submit}>
                Run investigation
              </Button>
            </div>
          </Panel>

          {active ? (
            <ActiveRun key={active} caseId={active} />
          ) : (
            <Notice title="Structured investigations only">
              The dashboard runs evidence-based investigations through the agents API. Free-form chat with the agents is available in the terminal with <Mono>vigil chat</Mono>.
            </Notice>
          )}
        </div>

        <AgentRoster />
      </div>
    </>
  );
}
