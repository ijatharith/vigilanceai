import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ActivityChart, SeverityDistribution, SeverityLegend } from "../components/charts";
import { Icon } from "../components/icons";
import { CaseLink, useInvestigation } from "../components/investigation";
import {
  AssessmentBadge,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Kpi,
  LoadingRows,
  Mono,
  PageHeader,
  Panel,
  RunStatusBadge,
  SeverityBadge,
  SourceTag,
  Table,
  rowButtonClass,
  tdClass,
} from "../components/ui";
import { useApp } from "../lib/appContext";
import { formatDateTime, formatRelative } from "../lib/format";
import type { CaseRow, DashboardStats, StoredAlert, WazuhAgentsResponse } from "../lib/types";
import { useApi } from "../lib/useApi";

function AiBriefing({ cases }: { cases: CaseRow[] | undefined }) {
  const latest = cases?.find((c) => c.status === "completed" || c.status === "partial") ?? null;
  const { report } = useInvestigation(latest?.case_id ?? null);
  const r = report.data;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Icon.Sparkle size={16} className="text-accent" /> AI security briefing
        </span>
      }
      aside={<SourceTag kind="live">AI-generated</SourceTag>}
    >
      {!latest ? (
        <EmptyState title="No completed investigation yet" icon={<Icon.Bot size={22} />} action={<Link to="/ai-analyst" className="text-[13px] text-accent">Start one in AI Analyst →</Link>}>
          The briefing summarises the most recent VIGIL investigation. It is never generated without one.
        </EmptyState>
      ) : report.error ? (
        <ErrorState error={report.error} title="AI briefing unavailable" onRetry={report.reload} />
      ) : !r ? (
        <LoadingRows rows={3} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <AssessmentBadge value={r.security_assessment} />
            <span>
              From <CaseLink caseId={r.case_id} /> · {latest.alert_summary ?? "alert"} · {formatRelative(latest.updated_at)}
            </span>
          </div>
          <p className="m-0 text-[14px] leading-relaxed">{r.executive_summary}</p>
          {r.supported_findings.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs text-muted">
              Linked evidence:
              {r.supported_findings.flatMap((f) => f.evidence_ids).slice(0, 6).map((id) => (
                <Mono key={id} className="text-accent">{id}</Mono>
              ))}
            </div>
          )}
          <p className="m-0 border-t border-line pt-2.5 text-[11.5px] text-subtle">
            AI output is an interpretation of bounded evidence, not verified fact. It does not confirm a compromise. An analyst must review the case.
          </p>
        </div>
      )}
    </Panel>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const { reloadStats } = useApp();
  const stats = useApi<DashboardStats>("/dashboard/stats", { interval: 60_000 });
  const recent = useApi<StoredAlert[]>("/alerts/stored?limit=6");
  const cases = useApi<CaseRow[]>("/ai/investigations?limit=6", { interval: 15_000 });
  const agents = useApi<WazuhAgentsResponse>("/wazuh/agents?limit=500", { interval: 60_000 });
  const [table, setTable] = useState(false);

  const s = stats.data;
  const endpointItems = agents.data?.data.affected_items ?? [];
  const activeEndpoints = endpointItems.filter((a) => a.status === "active").length;

  const refresh = () => {
    stats.reload();
    recent.reload();
    cases.reload();
    agents.reload();
    reloadStats();
  };

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Security posture across synced Wazuh alerts, VIGIL investigations and monitored endpoints."
        tags={<SourceTag kind="live">Live data · backend /api/v1</SourceTag>}
        actions={
          <Button onClick={refresh} icon={<Icon.Refresh size={15} />} loading={stats.loading && stats.settled}>
            Refresh
          </Button>
        }
      />

      {stats.error && <ErrorState error={stats.error} onRetry={stats.reload} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Stored alerts" value={s?.total_alerts ?? "—"} loading={!stats.settled} sub="Synced into PostgreSQL" />
        <Kpi label="Critical alerts" value={s?.critical_alerts ?? "—"} loading={!stats.settled} tone={s?.critical_alerts ? "critical" : undefined} sub="Wazuh level ≥ 12" />
        <Kpi label="Active investigations" value={s?.investigations.active ?? "—"} loading={!stats.settled} sub="Queued or running" />
        <Kpi label="Completed investigations" value={s?.investigations.completed ?? "—"} loading={!stats.settled} sub={s ? `${s.investigations.failed} failed` : undefined} />
        <Kpi
          label="Connected endpoints"
          value={agents.error ? "N/A" : agents.data ? `${activeEndpoints}/${endpointItems.length}` : "—"}
          loading={!agents.settled}
          sub={agents.error ? "Wazuh Manager unavailable" : "Wazuh agents active"}
        />
        <Kpi label="Awaiting analyst review" value={s?.investigations.awaiting_review ?? "—"} loading={!stats.settled} tone={s?.investigations.awaiting_review ? "warn" : undefined} sub="Completed, not yet reviewed" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          title="Alert activity"
          description={
            s?.activity.window_end
              ? `Stored alerts per hour for the 24 h ending ${formatDateTime(s.activity.window_end)} (the newest stored alert), not the current time.`
              : "Stored alerts per hour."
          }
          aside={
            <button type="button" onClick={() => setTable((t) => !t)} className="cursor-pointer border-0 bg-transparent text-xs text-accent hover:underline">
              {table ? "Show chart" : "Show table"}
            </button>
          }
        >
          {!stats.settled ? (
            <LoadingRows rows={4} />
          ) : s && s.activity.buckets.length ? (
            <>
              <SeverityLegend />
              <ActivityChart buckets={s.activity.buckets} showTable={table} />
            </>
          ) : (
            <EmptyState title="No stored alerts" action={<Link to="/alerts" className="text-[13px] text-accent">Sync alerts from Wazuh →</Link>}>
              Alerts appear here after they are synced from the Wazuh Indexer into PostgreSQL.
            </EmptyState>
          )}
        </Panel>

        <Panel className="xl:col-span-5" title="Severity distribution" description="All stored alerts, grouped by Wazuh rule level.">
          {!stats.settled ? (
            <LoadingRows rows={4} />
          ) : s ? (
            <>
              <SeverityDistribution counts={{ critical: s.critical_alerts, high: s.high_alerts, medium: s.medium_alerts, low: s.low_alerts }} />
              {s.top_rules.length > 0 && (
                <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
                  <span className="text-xs font-medium text-muted">Most frequent rules</span>
                  {s.top_rules.map((r) => (
                    <Link key={`${r.rule_id}-${r.description}`} to={`/alerts?rule_id=${r.rule_id ?? ""}`} className="flex items-center justify-between gap-3 text-[13px] text-fg no-underline hover:text-accent">
                      <span className="truncate">
                        <Mono className="text-muted">{r.rule_id}</Mono> {r.description}
                      </span>
                      <span className="tabular-nums text-muted">{r.count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Recent alerts" aside={<Link to="/alerts" className="text-accent">View all →</Link>}>
          {recent.error ? (
            <ErrorState error={recent.error} onRetry={recent.reload} />
          ) : !recent.settled ? (
            <LoadingRows />
          ) : recent.data?.length ? (
            <Table head={["Time", "Severity", "Rule", "Endpoint"]} minWidth="min-w-140">
              {recent.data.map((a) => (
                <tr key={a.alert_id} className={rowButtonClass} onClick={() => navigate(`/alerts?alert=${encodeURIComponent(a.alert_id)}`)}>
                  <td className={`${tdClass} whitespace-nowrap text-muted`}>{formatDateTime(a.timestamp)}</td>
                  <td className={tdClass}>
                    <SeverityBadge level={a.level} />
                  </td>
                  <td className={tdClass}>
                    <span className="line-clamp-1">{a.rule_description}</span>
                  </td>
                  <td className={tdClass}>{a.agent_name ?? "—"}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="No stored alerts yet" />
          )}
        </Panel>

        <div className="flex flex-col gap-5 xl:col-span-5">
          <AiBriefing cases={cases.data} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Investigations" aside={<Link to="/incidents" className="text-accent">All incidents →</Link>}>
          {cases.error ? (
            <ErrorState error={cases.error} onRetry={cases.reload} />
          ) : !cases.settled ? (
            <LoadingRows rows={3} />
          ) : cases.data?.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {cases.data.map((c) => (
                <li key={c.case_id}>
                  <Link to={`/incidents/${c.case_id}`} className="flex flex-wrap items-center gap-2.5 rounded-lg px-2 py-2 text-fg no-underline hover:bg-hover/50">
                    <Mono className="text-accent">{c.case_id}</Mono>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{c.alert_summary ?? "Manual alert"}</span>
                    <RunStatusBadge status={c.status} />
                    <AssessmentBadge value={c.security_assessment} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No investigations yet" action={<Link to="/ai-analyst" className="text-[13px] text-accent">Open AI Analyst →</Link>}>
              Start one from an alert's detail panel or from the AI Analyst workspace.
            </EmptyState>
          )}
          {cases.meta.agents_reachable === false && <Badge tone="warn">Agents service unreachable · statuses may be stale</Badge>}
        </Panel>

        <Panel title="Endpoint health" aside={<Link to="/endpoints" className="text-accent">All endpoints →</Link>}>
          {agents.error ? (
            <ErrorState error={agents.error} onRetry={agents.reload} />
          ) : !agents.settled ? (
            <LoadingRows rows={3} />
          ) : endpointItems.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {endpointItems.slice(0, 6).map((a) => {
                const count = s?.alerts_by_agent.find((x) => x.agent_id === a.id)?.count ?? 0;
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-2.5 rounded-lg px-2 py-2 text-[13px]">
                    <span className={`size-2 rounded-full ${a.status === "active" ? "bg-ok" : a.status === "disconnected" ? "bg-fail" : "bg-subtle"}`} aria-hidden="true" />
                    <span className="font-medium">{a.name}</span>
                    <Mono className="text-muted">{a.id}</Mono>
                    <span className="text-xs text-muted">{a.status.replace("_", " ")}</span>
                    <span className="ml-auto text-xs text-muted">{count} stored alerts</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No Wazuh agents registered" />
          )}
        </Panel>
      </div>
    </>
  );
}
