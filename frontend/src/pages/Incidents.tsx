import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Icon } from "../components/icons";
import {
  AssessmentBadge,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingRows,
  Mono,
  PageHeader,
  Panel,
  ReviewBadge,
  RunStatusBadge,
  SeverityBadge,
  Tabs,
  Table,
  rowButtonClass,
  tdClass,
} from "../components/ui";
import { formatDateTime, formatRelative } from "../lib/format";
import type { CaseRow } from "../lib/types";
import { useApi } from "../lib/useApi";

type Filter = "all" | "active" | "review" | "reviewed" | "failed";
const TERMINAL = new Set(["completed", "partial", "failed", "cancelled"]);

const ORIGIN: Record<CaseRow["origin"], string> = {
  stored_alert: "Stored alert",
  live_alert: "Live alert",
  manual: "Manual / sample",
};

export default function Incidents() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const anyActive = (rows?: CaseRow[]) => rows?.some((r) => !TERMINAL.has(r.status));
  const cases = useApi<CaseRow[]>("/ai/investigations?limit=200", { interval: 10_000 });
  const rows = cases.data ?? [];

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => !TERMINAL.has(r.status)).length,
      review: rows.filter((r) => (r.status === "completed" || r.status === "partial") && !r.review_decision).length,
      reviewed: rows.filter((r) => r.review_decision).length,
      failed: rows.filter((r) => r.status === "failed" || r.status === "cancelled").length,
    }),
    [rows],
  );

  const shown = rows.filter((r) => {
    if (filter === "active") return !TERMINAL.has(r.status);
    if (filter === "review") return (r.status === "completed" || r.status === "partial") && !r.review_decision;
    if (filter === "reviewed") return !!r.review_decision;
    if (filter === "failed") return r.status === "failed" || r.status === "cancelled";
    return true;
  });

  return (
    <>
      <PageHeader
        title="Incidents"
        subtitle="Investigation cases run by the VIGIL agents (Orchestrator → Triage, Malware, Hunter). Each case needs an analyst decision; nothing is executed automatically."
        actions={
          <>
            <Button onClick={cases.reload} icon={<Icon.Refresh size={15} />}>
              Refresh
            </Button>
            <Link to="/ai-analyst" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-white no-underline hover:bg-primary-soft">
              <Icon.Bot size={16} /> New investigation
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: `All (${counts.all})` },
            { value: "active", label: `Running (${counts.active})` },
            { value: "review", label: `Awaiting review (${counts.review})` },
            { value: "reviewed", label: `Reviewed (${counts.reviewed})` },
            { value: "failed", label: `Failed (${counts.failed})` },
          ]}
        />
        <span className="text-xs text-subtle">
          {anyActive(rows) ? "Refreshing running cases every 10 s" : "Lists cases started from Vigilance"}
          {cases.meta.agents_reachable === false && " · agents service unreachable, statuses may be stale"}
        </span>
      </div>

      <Panel>
        {cases.error ? (
          <ErrorState error={cases.error} onRetry={cases.reload} />
        ) : !cases.settled ? (
          <LoadingRows rows={6} />
        ) : shown.length ? (
          <Table head={["Case", "Alert", "Alert severity", "Origin", "Run status", "AI assessment", "Analyst review", "Opened"]} minWidth="min-w-250">
            {shown.map((c) => (
              <tr key={c.case_id} className={rowButtonClass} tabIndex={0} onClick={() => navigate(`/incidents/${c.case_id}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/incidents/${c.case_id}`)}>
                <td className={tdClass}>
                  <Mono className="text-accent">{c.case_id}</Mono>
                </td>
                <td className={`${tdClass} max-w-90`}>
                  <span className="line-clamp-2">{c.alert_summary ?? <span className="text-subtle">No description</span>}</span>
                  {c.alert_id && <Mono className="block text-[11px] text-subtle">{c.alert_id}</Mono>}
                </td>
                <td className={tdClass}>{c.alert_level !== null ? <SeverityBadge level={c.alert_level} /> : <span className="text-xs text-subtle">—</span>}</td>
                <td className={tdClass}>
                  <Badge>{ORIGIN[c.origin] ?? c.origin}</Badge>
                </td>
                <td className={tdClass}>
                  <RunStatusBadge status={c.status} />
                </td>
                <td className={tdClass}>
                  <AssessmentBadge value={c.security_assessment} />
                </td>
                <td className={tdClass}>{TERMINAL.has(c.status) && c.status !== "failed" && c.status !== "cancelled" ? <ReviewBadge value={c.review_decision} /> : <span className="text-xs text-subtle">—</span>}</td>
                <td className={`${tdClass} whitespace-nowrap text-muted`} title={formatDateTime(c.created_at)}>
                  {formatRelative(c.created_at)}
                </td>
              </tr>
            ))}
          </Table>
        ) : rows.length ? (
          <EmptyState title="No cases in this view" />
        ) : (
          <EmptyState title="No investigations yet" icon={<Icon.Incident size={22} />} action={<Link to="/alerts" className="text-[13px] text-accent">Pick an alert to investigate →</Link>}>
            Open an alert and choose “Investigate with AI”, or submit one from the AI Analyst workspace.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
