import { useMemo } from "react";
import { Link } from "react-router";
import { Icon } from "../components/icons";
import { CaseLink } from "../components/investigation";
import { AssessmentBadge, Badge, EmptyState, ErrorState, LoadingRows, Notice, PageHeader, Panel, ReviewBadge, SourceTag } from "../components/ui";
import { formatRelative } from "../lib/format";
import type { Recommendation } from "../lib/types";
import { useApi } from "../lib/useApi";

// From the dashboard design brief. Shown as planned only: no playbook exists yet.
const PLANNED_PLAYBOOKS = [
  { name: "SSH Brute Force Response", desc: "Block source IP at the perimeter after analyst approval." },
  { name: "Suspicious Login Investigation", desc: "Collect session context and notify the account owner." },
  { name: "Malware Detection Response", desc: "Isolate the host and quarantine the file hash." },
  { name: "File Integrity Alert Triage", desc: "Compare the change against the approved change log." },
];

export default function Soar() {
  const recs = useApi<Recommendation[]>("/ai/recommendations?limit=30");

  const grouped = useMemo(() => {
    const m = new Map<string, Recommendation[]>();
    for (const r of recs.data ?? []) m.set(r.case_id, [...(m.get(r.case_id) ?? []), r]);
    return [...m.entries()];
  }, [recs.data]);

  return (
    <>
      <PageHeader
        title="SOAR Automation"
        subtitle="Response recommendations, approvals and execution history. Every impactful action must be approved by a human before it runs."
        tags={<SourceTag kind="planned">Phase 5 · n8n not connected</SourceTag>}
      />

      <Notice tone="warn" title="Response execution is not connected">
        The n8n / SOAR integration is planned for Phase 5, so nothing on this page executes an action. The VIGIL agents are read-only and every report states
        <span className="font-mono"> response_executed: false</span>. Recommendations below are suggestions for an analyst.
      </Notice>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Panel
          title="Recommendations from investigations"
          description="Next steps proposed by completed VIGIL investigations, grouped by case. Review a case before acting on any of them."
          aside={recs.data ? <SourceTag kind="live">Live</SourceTag> : undefined}
        >
          {recs.error ? (
            <ErrorState error={recs.error} onRetry={recs.reload} />
          ) : !recs.settled ? (
            <LoadingRows rows={5} />
          ) : grouped.length ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {grouped.map(([caseId, items]) => (
                <li key={caseId} className="flex flex-col gap-2.5 rounded-lg border border-line p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <CaseLink caseId={caseId} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{items[0].alert_summary ?? "Manual alert"}</span>
                    <AssessmentBadge value={items[0].security_assessment} />
                    <ReviewBadge value={items[0].review_decision} />
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {items.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-start gap-2 text-[13px]">
                        <span className="pt-0.5 text-subtle" aria-hidden="true">→</span>
                        <span className="min-w-0 flex-1">{r.recommendation}</span>
                        <Badge tone="warn">{r.response_executed ? "Executed" : "Recommended · not executed"}</Badge>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between gap-2 text-xs text-subtle">
                    <span>Case opened {formatRelative(items[0].case_created_at)}</span>
                    <Link to={`/incidents/${caseId}`} className="text-accent no-underline hover:underline">
                      Review case →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No recommendations yet" icon={<Icon.Bolt size={22} />}>
              Recommendations appear when an investigation completes.
              {Number(recs.meta.reports_unavailable ?? 0) > 0 && ` ${recs.meta.reports_unavailable} report(s) could not be loaded from the agents service.`}
            </EmptyState>
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Pending approvals" aside={<SourceTag kind="planned">Planned</SourceTag>}>
            <EmptyState title="No approval requests" icon={<Icon.Lock size={22} />}>
              The approval gate (<span className="font-mono">/response/&#123;id&#125;/request-approval</span> and <span className="font-mono">/approve</span>) is not built yet. When it is, each request will show the
              incident, action, target, reason, evidence, impact and requester before Approve or Reject.
            </EmptyState>
          </Panel>
          <Panel title="Execution history" aside={<SourceTag kind="planned">Planned</SourceTag>}>
            <EmptyState title="No executions" icon={<Icon.Clock size={22} />}>
              No response has ever been executed by Vigilance.
            </EmptyState>
          </Panel>
          <Panel title="Playbook library" aside={<SourceTag kind="planned">Planned · not implemented</SourceTag>}>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {PLANNED_PLAYBOOKS.map((p) => (
                <li key={p.name} className="flex flex-col gap-0.5 rounded-lg border border-dashed border-line p-3 opacity-80">
                  <span className="text-[13px] font-medium">{p.name}</span>
                  <span className="text-xs text-muted">{p.desc}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
