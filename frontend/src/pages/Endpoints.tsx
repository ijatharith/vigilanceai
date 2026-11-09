import { useState } from "react";
import { Link } from "react-router";
import { Icon } from "../components/icons";
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  JsonBlock,
  KeyValue,
  Kpi,
  LoadingRows,
  Mono,
  PageHeader,
  Panel,
  SectionLabel,
  SourceTag,
  Table,
  Tabs,
  rowButtonClass,
  tdClass,
  type Tone,
} from "../components/ui";
import { formatDateTime, formatRelative, humanize } from "../lib/format";
import type { DashboardStats, WazuhAgent, WazuhAgentsResponse } from "../lib/types";
import { useApi } from "../lib/useApi";

type Filter = "all" | "active" | "disconnected" | "other";
const STATUS_TONE: Record<string, Tone> = { active: "ok", disconnected: "fail", never_connected: "neutral", pending: "warn" };

export default function Endpoints() {
  const agents = useApi<WazuhAgentsResponse>("/wazuh/agents?limit=500", { interval: 60_000 });
  const stats = useApi<DashboardStats>("/dashboard/stats");
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<WazuhAgent | null>(null);

  const items = agents.data?.data.affected_items ?? [];
  const alertCount = (id: string) => stats.data?.alerts_by_agent.find((a) => a.agent_id === id)?.count ?? 0;
  const count = (s: string) => items.filter((a) => a.status === s).length;
  const shown = items.filter((a) => (filter === "all" ? true : filter === "other" ? a.status !== "active" && a.status !== "disconnected" : a.status === filter));

  return (
    <>
      <PageHeader
        title="Endpoints"
        subtitle="Wazuh agent inventory from the Wazuh Manager API. Read-only: Vigilance does not manage, restart or isolate agents."
        tags={<SourceTag kind="live">Live · Wazuh Manager</SourceTag>}
        actions={
          <Button onClick={agents.reload} loading={agents.loading && agents.settled} icon={<Icon.Refresh size={15} />}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Registered agents" value={agents.error ? "N/A" : items.length} loading={!agents.settled} />
        <Kpi label="Active" value={agents.error ? "N/A" : count("active")} loading={!agents.settled} />
        <Kpi label="Disconnected" value={agents.error ? "N/A" : count("disconnected")} loading={!agents.settled} tone={count("disconnected") ? "warn" : undefined} />
        <Kpi label="Never connected / pending" value={agents.error ? "N/A" : count("never_connected") + count("pending")} loading={!agents.settled} />
      </div>

      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "disconnected", label: "Disconnected" },
          { value: "other", label: "Other" },
        ]}
      />

      <Panel>
        {agents.error ? (
          <ErrorState error={agents.error} onRetry={agents.reload} />
        ) : !agents.settled ? (
          <LoadingRows rows={5} />
        ) : shown.length ? (
          <Table head={["Agent ID", "Hostname", "IP", "Operating system", "Agent version", "Status", "Last activity", "Stored alerts"]} minWidth="min-w-230">
            {shown.map((a) => (
              <tr key={a.id} className={rowButtonClass} tabIndex={0} onClick={() => setSel(a)} onKeyDown={(e) => e.key === "Enter" && setSel(a)}>
                <td className={tdClass}>
                  <Mono>{a.id}</Mono>
                  {a.id === "000" && <span className="ml-1.5 text-[11px] text-subtle">manager</span>}
                </td>
                <td className={`${tdClass} font-medium`}>{a.name}</td>
                <td className={tdClass}>
                  <Mono>{a.ip ?? "—"}</Mono>
                </td>
                <td className={tdClass}>
                  {a.os?.name ?? "—"} <span className="text-xs text-subtle">{a.os?.version}</span>
                </td>
                <td className={tdClass}>
                  <Mono className="text-muted">{a.version ?? "—"}</Mono>
                </td>
                <td className={tdClass}>
                  <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>{humanize(a.status)}</Badge>
                </td>
                <td className={`${tdClass} whitespace-nowrap text-muted`} title={formatDateTime(a.lastKeepAlive)}>
                  {formatRelative(a.lastKeepAlive)}
                </td>
                <td className={`${tdClass} tabular-nums`}>{alertCount(a.id)}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState title={items.length ? "No endpoints in this view" : "No agents registered"} />
        )}
      </Panel>

      <Drawer open={!!sel} onClose={() => setSel(null)} title={sel?.name ?? ""} subtitle={<span>Agent <Mono>{sel?.id}</Mono></span>}>
        {sel && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge tone={STATUS_TONE[sel.status] ?? "neutral"}>{humanize(sel.status)}</Badge>
              <SourceTag kind="live">Wazuh Manager</SourceTag>
            </div>
            <KeyValue
              items={[
                ["IP", <Mono>{sel.ip}</Mono>],
                ["Registered IP", <Mono>{sel.registerIP}</Mono>],
                ["OS", `${sel.os?.name ?? "—"} ${sel.os?.version ?? ""}`],
                ["Platform", `${sel.os?.platform ?? "—"} · ${sel.os?.arch ?? ""}`],
                ["Agent version", sel.version],
                ["Groups", sel.group?.join(", ") || "—"],
                ["Config", humanize(sel.group_config_status)],
                ["Registered", formatDateTime(sel.dateAdd)],
                ["Last keep-alive", formatRelative(sel.lastKeepAlive)],
                ["Disconnected at", sel.disconnection_time ? formatDateTime(sel.disconnection_time) : "—"],
                ["Stored alerts", alertCount(sel.id)],
              ]}
            />
            <Link to={`/alerts?agent_id=${encodeURIComponent(sel.id)}`} onClick={() => setSel(null)} className="text-[13px] text-accent no-underline hover:underline">
              View this endpoint's alerts on Security Alerts →
            </Link>
            <SectionLabel>Raw agent record (untrusted, shown as text)</SectionLabel>
            <JsonBlock value={sel} />
          </>
        )}
      </Drawer>
    </>
  );
}
