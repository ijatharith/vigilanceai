import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Icon } from "../components/icons";
import { CaseLink } from "../components/investigation";
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  JsonBlock,
  KeyValue,
  LoadingRows,
  Mono,
  PageHeader,
  Pagination,
  Panel,
  RunStatusBadge,
  SectionLabel,
  Select,
  SeverityBadge,
  SourceTag,
  Table,
  Tabs,
  TextInput,
  rowButtonClass,
  tdClass,
} from "../components/ui";
import { ApiError, post, qs } from "../lib/api";
import { useApp } from "../lib/appContext";
import { formatDateTime } from "../lib/format";
import type { CaseRow, DashboardStats, LiveAlert, StoredAlert, StoredAlertDetail, Submission } from "../lib/types";
import { useApi } from "../lib/useApi";

const PAGE = 25;
type Source = "stored" | "live";
type Sev = "" | "critical" | "high" | "medium" | "low";

function useInvestigate() {
  const navigate = useNavigate();
  const { notify, reloadStats } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async (path: string, payload?: unknown) => {
    setBusy(true);
    try {
      const { data } = await post<Submission>(path, payload);
      notify({ tone: "ok", title: data.created ? "Investigation queued" : "Existing investigation reopened", body: `${data.case_id} · the VIGIL Orchestrator will route it to specialists.` });
      reloadStats();
      navigate(`/incidents/${data.case_id}`);
    } catch (e) {
      const err = e as ApiError;
      notify({ tone: "fail", title: "Could not start the investigation", body: `${err.message} (${err.code})` });
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function StoredAlertDrawer({ alertId, cases, onClose }: { alertId: string | null; cases: Map<string, CaseRow>; onClose: () => void }) {
  const detail = useApi<StoredAlertDetail>(alertId ? `/alerts/stored/${encodeURIComponent(alertId)}` : null);
  const { busy, run } = useInvestigate();
  const a = detail.data;
  const existing = alertId ? cases.get(alertId) : undefined;

  return (
    <Drawer
      open={!!alertId}
      onClose={onClose}
      title={a?.rule_description ?? "Alert"}
      subtitle={<Mono>{alertId}</Mono>}
      footer={
        <>
          {existing && (
            <Link to={`/incidents/${existing.case_id}`} className="inline-flex min-h-10 items-center rounded-lg border border-line px-3.5 text-[13px] text-fg no-underline hover:bg-hover">
              Open {existing.case_id}
            </Link>
          )}
          <Button variant="primary" icon={<Icon.Bot size={16} />} loading={busy} disabled={!a} onClick={() => run(`/ai/investigations/from-alert/${encodeURIComponent(alertId!)}`)}>
            Investigate with AI
          </Button>
        </>
      }
    >
      {detail.error ? (
        <ErrorState error={detail.error} onRetry={detail.reload} />
      ) : !a ? (
        <LoadingRows rows={6} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge level={a.level} />
            <SourceTag kind="live">Stored · PostgreSQL</SourceTag>
            {existing && (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                Investigated: <CaseLink caseId={existing.case_id} /> <RunStatusBadge status={existing.status} />
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <SectionLabel>Rule metadata</SectionLabel>
            <KeyValue
              items={[
                ["Timestamp", <Mono>{formatDateTime(a.timestamp)}</Mono>],
                ["Rule ID", <Mono>{a.rule_id}</Mono>],
                ["Level", a.level],
                ["Groups", a.rule_groups.length ? <span className="flex flex-wrap gap-1">{a.rule_groups.map((g) => <Badge key={g}>{g}</Badge>)}</span> : "—"],
                ["Endpoint", a.agent_name ? <span>{a.agent_name} <Mono className="text-muted">({a.agent_id})</Mono></span> : "—"],
                ["Source IP", a.source_ip ? <Mono>{a.source_ip}</Mono> : "—"],
              ]}
            />
          </div>
          {a.mitre && (a.mitre.id?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2">
              <SectionLabel>MITRE ATT&CK (from the Wazuh rule)</SectionLabel>
              <KeyValue
                items={[
                  ["Technique", (a.mitre.id ?? []).map((id, i) => `${id} ${a.mitre?.technique?.[i] ?? ""}`).join(", ")],
                  ["Tactic", (a.mitre.tactic ?? []).join(", ")],
                ]}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <SectionLabel>Raw event (untrusted, shown as text)</SectionLabel>
            <JsonBlock value={a.full_event} />
          </div>
          <div className="flex flex-col gap-2">
            <SectionLabel>Related alerts (same rule)</SectionLabel>
            {a.related.length ? (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {a.related.map((r) => (
                  <li key={r.alert_id} className="flex flex-wrap items-center gap-2 text-[13px]">
                    <Mono className="text-muted">{formatDateTime(r.timestamp)}</Mono>
                    <span>{r.agent_name}</span>
                    <Mono className="text-subtle">{r.alert_id}</Mono>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[13px] text-subtle">No other stored alerts for this rule.</p>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

function LiveAlertDrawer({ alert, onClose }: { alert: LiveAlert | null; onClose: () => void }) {
  const { busy, run } = useInvestigate();
  return (
    <Drawer
      open={!!alert}
      onClose={onClose}
      title={alert?.rule?.description ?? "Live alert"}
      subtitle={<Mono>{alert?.id}</Mono>}
      footer={
        <Button variant="primary" icon={<Icon.Bot size={16} />} loading={busy} onClick={() => alert && run("/ai/investigations", { alert, origin: "live_alert" })}>
          Investigate with AI
        </Button>
      }
    >
      {alert && (
        <>
          <div className="flex flex-wrap gap-2">
            <SeverityBadge level={alert.rule?.level} />
            <SourceTag kind="live">Live · Wazuh Indexer</SourceTag>
          </div>
          <KeyValue
            items={[
              ["Timestamp", <Mono>{formatDateTime(alert.timestamp)}</Mono>],
              ["Rule ID", <Mono>{alert.rule?.id}</Mono>],
              ["Endpoint", alert.agent?.name],
              ["Source IP", alert.data?.srcip ? <Mono>{alert.data.srcip}</Mono> : "—"],
              ["Index", <Mono>{alert.index}</Mono>],
            ]}
          />
          <SectionLabel>Raw event (untrusted, shown as text)</SectionLabel>
          <JsonBlock value={alert} />
        </>
      )}
    </Drawer>
  );
}

export default function Alerts() {
  const [params, setParams] = useSearchParams();
  const { notify, reloadStats } = useApp();
  const [source, setSource] = useState<Source>("stored");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [severity, setSeverity] = useState<Sev>("");
  const [agentId, setAgentId] = useState(params.get("agent_id") ?? "");
  const [ruleId, setRuleId] = useState(params.get("rule_id") ?? "");
  const [offset, setOffset] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [liveSel, setLiveSel] = useState<LiveAlert | null>(null);
  const selected = params.get("alert");

  // Keep the global-search term in sync when navigating here again.
  useEffect(() => {
    const term = params.get("q");
    if (term !== null) setQ(term);
  }, [params]);

  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setOffset(0);
  }, [debouncedQ, severity, agentId, ruleId]);

  const stored = useApi<StoredAlert[]>(
    source === "stored" ? `/alerts/stored${qs({ q: debouncedQ, severity, agent_id: agentId, rule_id: ruleId, limit: PAGE, offset })}` : null,
  );
  const live = useApi<LiveAlert[]>(source === "live" ? "/alerts?limit=100" : null);
  const stats = useApi<DashboardStats>("/dashboard/stats");
  const cases = useApi<CaseRow[]>("/ai/investigations?limit=200");

  const caseByAlert = useMemo(() => {
    const m = new Map<string, CaseRow>();
    for (const c of cases.data ?? []) if (c.alert_id && !m.has(c.alert_id)) m.set(c.alert_id, c);
    return m;
  }, [cases.data]);

  const openAlert = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("alert", id);
    else next.delete("alert");
    setParams(next, { replace: true });
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await post<unknown>("/alerts/sync?limit=100");
      const m = r.meta as { retrieved?: number; inserted?: number; skipped?: number };
      notify({ tone: "ok", title: "Alerts synced from Wazuh", body: `${m.retrieved} retrieved · ${m.inserted} new · ${m.skipped} already stored` });
      stored.reload();
      reloadStats();
    } catch (e) {
      const err = e as ApiError;
      notify({ tone: "fail", title: "Sync failed", body: `${err.message} (${err.code})` });
    } finally {
      setSyncing(false);
    }
  };

  const total = Number(stored.meta.total ?? 0);
  const filtersActive = !!(debouncedQ || severity || agentId || ruleId);

  return (
    <>
      <PageHeader
        title="Security Alerts"
        subtitle="Search Wazuh alerts synced into PostgreSQL, or read the live Indexer feed. Open an alert to inspect it or hand it to the VIGIL agents."
        actions={
          <Button variant="primary" icon={<Icon.Sync size={15} />} loading={syncing} onClick={sync}>
            Sync from Wazuh
          </Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs<Source>
          value={source}
          onChange={setSource}
          tabs={[
            { value: "stored", label: "Stored (PostgreSQL)" },
            { value: "live", label: "Live (Wazuh Indexer, 24 h)" },
          ]}
        />
      </div>

      {source === "stored" ? (
        <Panel>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <TextInput label="Search" placeholder="Description, rule ID, endpoint, alert ID" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select<Sev>
              label="Severity"
              value={severity}
              onChange={setSeverity}
              options={[
                { value: "", label: "All severities" },
                { value: "critical", label: "Critical (12+)" },
                { value: "high", label: "High (10–11)" },
                { value: "medium", label: "Medium (7–9)" },
                { value: "low", label: "Low (0–6)" },
              ]}
            />
            <Select
              label="Endpoint"
              value={agentId}
              onChange={setAgentId}
              options={[{ value: "", label: "All endpoints" }, ...(stats.data?.alerts_by_agent ?? []).map((a) => ({ value: a.agent_id ?? "", label: `${a.agent_name ?? a.agent_id} (${a.count})` }))]}
            />
            <TextInput label="Rule ID" placeholder="e.g. 5402" value={ruleId} onChange={(e) => setRuleId(e.target.value.trim())} />
            <div className="flex items-end">
              <Button
                variant="ghost"
                disabled={!filtersActive && !q}
                onClick={() => {
                  setQ("");
                  setSeverity("");
                  setAgentId("");
                  setRuleId("");
                  setParams({}, { replace: true });
                }}
              >
                Clear
              </Button>
            </div>
          </div>

          {stored.error ? (
            <ErrorState error={stored.error} onRetry={stored.reload} />
          ) : !stored.settled ? (
            <LoadingRows rows={8} />
          ) : stored.data?.length ? (
            <>
              <Table head={["Timestamp", "Severity", "Rule ID", "Description", "Endpoint", "Source IP", "AI investigation"]} minWidth="min-w-240">
                {stored.data.map((a) => {
                  const c = caseByAlert.get(a.alert_id);
                  return (
                    <tr
                      key={a.alert_id}
                      className={`${rowButtonClass} ${selected === a.alert_id ? "bg-hover/60" : ""}`}
                      onClick={() => openAlert(a.alert_id)}
                      onKeyDown={(e) => e.key === "Enter" && openAlert(a.alert_id)}
                      tabIndex={0}
                    >
                      <td className={`${tdClass} whitespace-nowrap`}>
                        <Mono className="text-muted">{formatDateTime(a.timestamp)}</Mono>
                      </td>
                      <td className={tdClass}>
                        <SeverityBadge level={a.level} />
                      </td>
                      <td className={tdClass}>
                        <Mono>{a.rule_id}</Mono>
                      </td>
                      <td className={`${tdClass} max-w-100`}>
                        <span className="line-clamp-2">{a.rule_description}</span>
                      </td>
                      <td className={tdClass}>{a.agent_name ?? "—"}</td>
                      <td className={tdClass}>{a.source_ip ? <Mono>{a.source_ip}</Mono> : <span className="text-subtle">—</span>}</td>
                      <td className={tdClass}>{c ? <RunStatusBadge status={c.status} /> : <span className="text-xs text-subtle">Not investigated</span>}</td>
                    </tr>
                  );
                })}
              </Table>
              <Pagination offset={offset} limit={PAGE} total={total} onChange={setOffset} />
            </>
          ) : filtersActive ? (
            <EmptyState title="No alerts match these filters" />
          ) : (
            <EmptyState title="No stored alerts" action={<Button onClick={sync} loading={syncing} icon={<Icon.Sync size={15} />}>Sync from Wazuh</Button>}>
              Pull the latest alerts from the Wazuh Indexer into PostgreSQL to search and investigate them.
            </EmptyState>
          )}
        </Panel>
      ) : (
        <Panel description="Read straight from the Wazuh Indexer on each load (last 24 hours, newest 100). Investigating a live alert also reuses its case if it was submitted before.">
          {live.error ? (
            <ErrorState error={live.error} onRetry={live.reload} />
          ) : !live.settled ? (
            <LoadingRows rows={8} />
          ) : live.data?.length ? (
            <Table head={["Timestamp", "Severity", "Rule ID", "Description", "Endpoint", "Source IP"]} minWidth="min-w-220">
              {live.data.map((a) => (
                <tr key={a.id} className={rowButtonClass} onClick={() => setLiveSel(a)} onKeyDown={(e) => e.key === "Enter" && setLiveSel(a)} tabIndex={0}>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    <Mono className="text-muted">{formatDateTime(a.timestamp)}</Mono>
                  </td>
                  <td className={tdClass}>
                    <SeverityBadge level={a.rule?.level} />
                  </td>
                  <td className={tdClass}>
                    <Mono>{a.rule?.id}</Mono>
                  </td>
                  <td className={tdClass}>{a.rule?.description}</td>
                  <td className={tdClass}>{a.agent?.name ?? "—"}</td>
                  <td className={tdClass}>{a.data?.srcip ? <Mono>{a.data.srcip}</Mono> : "—"}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="No alerts in the last 24 hours">The Wazuh Indexer returned no alerts for this window.</EmptyState>
          )}
        </Panel>
      )}

      <StoredAlertDrawer alertId={selected} cases={caseByAlert} onClose={() => openAlert(null)} />
      <LiveAlertDrawer alert={liveSel} onClose={() => setLiveSel(null)} />
    </>
  );
}
