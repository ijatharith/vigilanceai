import { Fragment, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { humanize, formatDateTime } from "../lib/format";
import type { AgentResult, CaseReport, CaseRow, InvestigationStatus, ObservedFact } from "../lib/types";
import { useApi } from "../lib/useApi";
import { Icon } from "./icons";
import { AssessmentBadge, Badge, EmptyState, JsonBlock, Mono, RunStatusBadge, SectionLabel, Table, tdClass, type Tone } from "./ui";

const JOB_TERMINAL = new Set(["completed", "partial", "failed", "cancelled"]);

/**
 * Polls an investigation until its report is saved or its job ends.
 * Note: the agents service can mark the *case* completed when the first
 * specialist finishes while the Orchestrator job is still running, so
 * completion is judged by report_ready and the job status, not `terminal`.
 */
export function useInvestigation(caseId: string | null) {
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const done = doneFor !== null && doneFor === caseId;
  const status = useApi<InvestigationStatus>(caseId ? `/ai/investigations/${caseId}` : null, { interval: done ? undefined : 3000 });
  const s = status.data?.case_id === caseId ? status.data : undefined;
  const jobEnded = !!s?.job && JOB_TERMINAL.has(s.job.status);
  const finished = !!s && (s.report_ready || jobEnded);
  if (finished && !done) setDoneFor(caseId);
  const report = useApi<CaseReport>(caseId && s?.report_ready ? `/ai/investigations/${caseId}/report` : null);
  const meta = status.meta.case as CaseRow | null | undefined;
  const caseRow = meta && meta.case_id === caseId ? meta : null;
  return { status: { ...status, data: s }, report, caseRow, finished, reportMissing: jobEnded && !!s && !s.report_ready };
}

const AGENT_ORDER = ["orchestrator", "triage", "malware", "hunter"];

/** Agent activity: neutral states only, no chain-of-thought. */
export function InvestigationProgress({ status, reportReady }: { status: InvestigationStatus | undefined; reportReady: boolean }) {
  const job = status?.job?.status ?? status?.status ?? "queued";
  const runs = status?.agent_runs ?? [];
  const failed = job === "failed" || job === "cancelled";
  const steps: { label: string; state: "done" | "active" | "waiting" | "failed" }[] = [
    { label: "Queued for the worker", state: status ? "done" : "active" },
    { label: "Retrieving evidence (read-only tools)", state: runs.length ? "done" : job === "running" ? "active" : failed ? "failed" : "waiting" },
    { label: "Specialist analysis", state: runs.length ? (reportReady ? "done" : "active") : "waiting" },
    { label: "Validating & preparing report", state: reportReady ? "done" : failed ? "failed" : runs.length ? "active" : "waiting" },
  ];
  const icon = { done: <Icon.Check size={14} />, active: <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />, waiting: <Icon.Clock size={14} />, failed: <Icon.X size={14} /> };
  const color = { done: "text-ok", active: "text-info", waiting: "text-subtle", failed: "text-fail" };

  return (
    <div className="flex flex-col gap-4">
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {steps.map((st) => (
          <li key={st.label} className="flex items-center gap-2.5 text-[13px]">
            <span className={`flex size-5 items-center justify-center ${color[st.state]}`} aria-hidden="true">
              {icon[st.state]}
            </span>
            <span className={st.state === "waiting" ? "text-subtle" : ""}>{st.label}</span>
            <span className="sr-only">({st.state})</span>
          </li>
        ))}
      </ol>
      {runs.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Agent runs</SectionLabel>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {[...runs]
              .sort((a, b) => AGENT_ORDER.indexOf(a.agent_id) - AGENT_ORDER.indexOf(b.agent_id))
              .map((r) => (
                <li key={r.run_id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-medium">{humanize(r.agent_id)}</span>
                  <RunStatusBadge status={r.run_status} />
                  <span className="text-xs text-subtle">
                    {r.tool_calls.length} tool call{r.tool_calls.length === 1 ? "" : "s"} · {r.model_provider} · {r.model_id}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
      {status?.job?.error && <p className="m-0 text-[13px] text-fail">Job error: {status.job.error}</p>}
    </div>
  );
}

const FACT_KIND: Record<ObservedFact["kind"], [Tone, string]> = {
  verified_observation: ["ok", "Verified observation"],
  analyst_hypothesis: ["warn", "Hypothesis"],
  model_inference: ["info", "Model inference"],
  recommended_action: ["primary", "Recommendation"],
};

export function EvidenceChips({ ids }: { ids: string[] }) {
  if (!ids.length) return <span className="text-xs text-subtle">No linked evidence</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <a key={id} href={`#${id}`} className="rounded-md border border-line bg-bg px-1.5 py-0.5 font-mono text-[11px] text-accent no-underline hover:border-accent">
          {id}
        </a>
      ))}
    </span>
  );
}

export function FindingsList({ facts }: { facts: ObservedFact[] }) {
  if (!facts.length)
    return (
      <EmptyState title="No supported findings">
        The agents did not produce any finding that passed evidence validation. Missing evidence is an evidence gap, not an all-clear.
      </EmptyState>
    );
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {facts.map((f, i) => {
        const [tone, label] = FACT_KIND[f.kind] ?? ["neutral", humanize(f.kind)];
        return (
          <li key={i} className="flex flex-col gap-2 rounded-lg border border-line bg-bg/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone}>{label}</Badge>
              {f.claims.length > 0 && <span className="text-[11px] text-subtle">{f.claims.length} machine-checked claim{f.claims.length === 1 ? "" : "s"}</span>}
            </div>
            <p className="m-0 text-[13px] leading-relaxed">{f.statement}</p>
            <EvidenceChips ids={f.evidence_ids} />
          </li>
        );
      })}
    </ul>
  );
}

export function BulletList({ items, empty, marker = "•" }: { items: string[]; empty: string; marker?: ReactNode }) {
  if (!items.length) return <p className="m-0 text-[13px] text-subtle">{empty}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
          <span className="text-subtle" aria-hidden="true">
            {marker}
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function SpecialistResult({ result }: { result: AgentResult }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <RunStatusBadge status={result.run_status} />
        <AssessmentBadge value={result.security_assessment} />
        <Mono className="text-xs text-muted">
          {result.model_provider} · {result.model_id}
        </Mono>
        <span className="text-xs text-subtle">
          {formatDateTime(result.started_at)} → {formatDateTime(result.completed_at)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Observed facts</SectionLabel>
        <FindingsList facts={result.observed_facts} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Hypotheses</SectionLabel>
        {result.hypotheses.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {result.hypotheses.map((h, i) => (
              <li key={i} className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
                <Badge tone="warn">{humanize(h.status)}</Badge>
                <p className="m-0 text-[13px]">{h.statement}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="flex items-center gap-1.5">Supports: <EvidenceChips ids={h.supporting_evidence_ids} /></span>
                  <span className="flex items-center gap-1.5">Contradicts: <EvidenceChips ids={h.contradictory_evidence_ids} /></span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[13px] text-subtle">No hypotheses.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Tool calls (read-only)</SectionLabel>
        <ToolCalls calls={result.tool_calls} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <SectionLabel>Evidence gaps</SectionLabel>
          <BulletList items={result.evidence_gaps} empty="None reported." />
        </div>
        <div className="flex flex-col gap-2">
          <SectionLabel>Limitations</SectionLabel>
          <BulletList items={result.limitations} empty="None reported." />
        </div>
      </div>
      {result.skills_used.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          Skills: {result.skills_used.map((s) => <Badge key={s}>{s}</Badge>)}
        </div>
      )}
    </div>
  );
}

export function ToolCalls({ calls }: { calls: AgentResult["tool_calls"] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!calls.length) return <p className="m-0 text-[13px] text-subtle">No tool calls.</p>;
  return (
    <Table head={["Tool", "Status", "Evidence", ""]} minWidth="min-w-120">
      {calls.map((c) => (
        <Fragment key={c.call_id}>
          <tr>
            <td className={tdClass}>
              <Mono>{c.tool_name}</Mono>
              {c.duplicate && <Badge tone="neutral">duplicate</Badge>}
            </td>
            <td className={tdClass}>
              <Badge tone={c.status === "completed" ? "ok" : c.error ? "fail" : "neutral"}>{humanize(c.status)}</Badge>
            </td>
            <td className={`${tdClass} tabular-nums`}>{c.evidence_ids.length}</td>
            <td className={`${tdClass} text-right`}>
              <button type="button" className="cursor-pointer border-0 bg-transparent text-xs text-accent hover:underline" onClick={() => setOpen(open === c.call_id ? null : c.call_id)} aria-expanded={open === c.call_id}>
                {open === c.call_id ? "Hide" : "Arguments"}
              </button>
            </td>
          </tr>
          {open === c.call_id && (
            <tr>
              <td colSpan={4} className="px-3.5 pb-3">
                <JsonBlock value={c.arguments} maxHeight="max-h-60" />
                {c.error && <p className="m-0 pt-2 text-xs text-fail">{c.error}</p>}
              </td>
            </tr>
          )}
        </Fragment>
      ))}
    </Table>
  );
}

export function CaseLink({ caseId }: { caseId: string }) {
  return (
    <Link to={`/incidents/${caseId}`} className="font-mono text-[12.5px] text-accent no-underline hover:underline">
      {caseId}
    </Link>
  );
}

export function SafetyBadges({ report }: { report?: Pick<CaseReport, "analyst_review_required" | "response_executed"> }) {
  return (
    <>
      <Badge tone="warn">ANALYST REVIEW REQUIRED</Badge>
      <Badge tone="neutral" title="VIGIL agents are read-only and never execute remediation">
        <Icon.Lock size={11} /> {report?.response_executed ? "RESPONSE EXECUTED" : "NO RESPONSE EXECUTED"}
      </Badge>
    </>
  );
}
