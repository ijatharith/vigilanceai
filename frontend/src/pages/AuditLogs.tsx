import { Fragment, useEffect, useState } from "react";
import { Icon } from "../components/icons";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  JsonBlock,
  LoadingRows,
  Mono,
  PageHeader,
  Pagination,
  Panel,
  Select,
  SourceTag,
  Table,
  tdClass,
} from "../components/ui";
import { qs } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { AuditEvent } from "../lib/types";
import { useApi } from "../lib/useApi";

const PAGE = 50;
const ACTION_LABEL: Record<string, string> = {
  "alerts.sync": "Synced alerts from Wazuh",
  "investigation.submit": "Started AI investigation",
  "investigation.review": "Reviewed AI findings",
};

export default function AuditLogs() {
  const [action, setAction] = useState("");
  const [result, setResult] = useState<"" | "success" | "failure">("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    setOffset(0);
  }, [action, result]);

  const logs = useApi<AuditEvent[]>(`/audit-logs${qs({ action, result, limit: PAGE, offset })}`, { interval: 30_000 });
  const actions = (logs.meta.actions as string[] | undefined) ?? [];

  return (
    <>
      <PageHeader
        title="Audit Logs"
        subtitle="Append-only record of analyst and system actions: alert syncs, investigations started and review decisions. Records cannot be edited or deleted."
        tags={<SourceTag kind="live">Live · PostgreSQL</SourceTag>}
        actions={
          <Button onClick={logs.reload} icon={<Icon.Refresh size={15} />}>
            Refresh
          </Button>
        }
      />
      <Panel>
        <div className="grid gap-3 sm:grid-cols-[minmax(200px,280px)_minmax(160px,200px)]">
          <Select label="Action" value={action} onChange={setAction} options={[{ value: "", label: "All actions" }, ...actions.map((a) => ({ value: a, label: ACTION_LABEL[a] ?? a }))]} />
          <Select<"" | "success" | "failure">
            label="Result"
            value={result}
            onChange={setResult}
            options={[
              { value: "", label: "All results" },
              { value: "success", label: "Success" },
              { value: "failure", label: "Failure" },
            ]}
          />
        </div>
        {logs.error ? (
          <ErrorState error={logs.error} onRetry={logs.reload} />
        ) : !logs.settled ? (
          <LoadingRows rows={8} />
        ) : logs.data?.length ? (
          <>
            <Table head={["Timestamp", "Actor", "Action", "Resource", "Result", "Context"]} minWidth="min-w-200">
              {logs.data.map((e) => (
                <Fragment key={e.id}>
                  <tr>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      <Mono className="text-muted">{formatDateTime(e.created_at)}</Mono>
                    </td>
                    <td className={`${tdClass} text-muted`}>{e.actor}</td>
                    <td className={tdClass}>
                      <span className="block">{ACTION_LABEL[e.action] ?? e.action}</span>
                      <Mono className="text-[11px] text-subtle">{e.action}</Mono>
                    </td>
                    <td className={tdClass}>{e.resource ? <Mono>{e.resource}</Mono> : "—"}</td>
                    <td className={tdClass}>
                      <Badge tone={e.result === "success" ? "ok" : "fail"}>{e.result === "success" ? "Success" : "Failure"}</Badge>
                    </td>
                    <td className={tdClass}>
                      {Object.keys(e.context).length ? (
                        <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id} className="cursor-pointer border-0 bg-transparent text-xs text-accent hover:underline">
                          {open === e.id ? "Hide" : "Show"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  {open === e.id && (
                    <tr>
                      <td colSpan={6} className="px-3.5 pb-3">
                        <JsonBlock value={e.context} maxHeight="max-h-48" />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </Table>
            <Pagination offset={offset} limit={PAGE} total={Number(logs.meta.total ?? 0)} onChange={setOffset} />
          </>
        ) : (
          <EmptyState title="No audit records" icon={<Icon.Log size={22} />}>
            Records appear when alerts are synced, investigations are started or findings are reviewed.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
