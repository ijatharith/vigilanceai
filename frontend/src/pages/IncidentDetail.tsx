import { useState } from "react";
import { Link, useParams } from "react-router";
import { Icon } from "../components/icons";
import {
  BulletList,
  FindingsList,
  InvestigationProgress,
  SafetyBadges,
  SpecialistResult,
  useInvestigation,
} from "../components/investigation";
import {
  AssessmentBadge,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  KeyValue,
  LoadingRows,
  Mono,
  Panel,
  ReviewBadge,
  RunStatusBadge,
  SectionLabel,
  SeverityBadge,
  Table,
  Tabs,
  tdClass,
} from "../components/ui";
import { ApiError, post } from "../lib/api";
import { useApp } from "../lib/appContext";
import { downloadJson, formatDateTime, humanize } from "../lib/format";
import type { CaseReport, CaseRow, ReviewDecision } from "../lib/types";

function ReviewPanel({ caseRow, onDone }: { caseRow: CaseRow; onDone: () => void }) {
  const { notify, reloadStats } = useApp();
  const [note, setNote] = useState(caseRow.review_note ?? "");
  const [busy, setBusy] = useState<ReviewDecision | null>(null);

  const submit = async (decision: ReviewDecision) => {
    setBusy(decision);
    try {
      await post(`/ai/investigations/${caseRow.case_id}/review`, { decision, note });
      notify({ tone: "ok", title: "Review recorded", body: `${humanize(decision)} · written to the audit log. No action was executed.` });
      reloadStats();
      onDone();
    } catch (e) {
      const err = e as ApiError;
      notify({ tone: "fail", title: "Review not saved", body: `${err.message} (${err.code})` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Analyst review" aside={<ReviewBadge value={caseRow.review_decision} />}>
      <p className="m-0 text-[13px] text-muted">Record your decision on the AI findings. This is logged for audit and does not trigger any response.</p>
      {caseRow.reviewed_at && <span className="text-xs text-subtle">Last reviewed {formatDateTime(caseRow.reviewed_at)}</span>}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
          className="rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-fg placeholder:text-subtle"
          placeholder="Why you agree or disagree with the findings"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" loading={busy === "findings_accepted"} disabled={!!busy} onClick={() => submit("findings_accepted")} icon={<Icon.Check size={14} />}>
          Accept findings
        </Button>
        <Button size="sm" loading={busy === "findings_rejected"} disabled={!!busy} onClick={() => submit("findings_rejected")}>
          Reject findings
        </Button>
        <Button size="sm" variant="danger" loading={busy === "escalated"} disabled={!!busy} onClick={() => submit("escalated")}>
          Escalate
        </Button>
      </div>
    </Panel>
  );
}

function Evidence({ report }: { report: CaseReport }) {
  const refs = report.specialist_results.flatMap((r) => r.evidence_refs.map((e) => ({ ...e, agent: r.agent_id })));
  return (
    <Panel title="Evidence & timeline" description="Event references returned by the agents' read-only tools. Order is only shown when the source event carried a timestamp.">
      {report.timeline.length > 0 ? (
        <ol className="m-0 flex list-none flex-col border-l border-line p-0 pl-4">
          {report.timeline.map((t, i) => (
            <li key={i} className="relative pb-3.5 last:pb-0">
              <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-accent" aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Mono className="text-muted">{t.observed_at ? formatDateTime(t.observed_at) : "No timestamp"}</Mono>
                <Badge>{t.source_type}</Badge>
                <Mono>{t.native_event_id}</Mono>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="No timeline events">The tools returned no timestamped events. This is an evidence gap, not proof that nothing happened.</EmptyState>
      )}
      {refs.length > 0 && (
        <div className="flex flex-col gap-2 pt-2">
          <SectionLabel>Evidence references</SectionLabel>
          <Table head={["Evidence ID", "Native event", "Source", "Agent"]} minWidth="min-w-120">
            {refs.map((e) => (
              <tr key={`${e.agent}-${e.evidence_id}`} id={e.evidence_id}>
                <td className={tdClass}>
                  <Mono className="text-accent">{e.evidence_id}</Mono>
                </td>
                <td className={tdClass}>
                  <Mono>{e.native_event_id}</Mono>
                </td>
                <td className={tdClass}>{e.source_type}</td>
                <td className={tdClass}>{humanize(e.agent)}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Panel>
  );
}

export default function IncidentDetail() {
  const { caseId = "" } = useParams();
  const valid = /^case-[0-9a-f]{12}$/.test(caseId);
  const { status, report, caseRow, finished, reportMissing } = useInvestigation(valid ? caseId : null);
  const [specTab, setSpecTab] = useState<string>("");
  const r = report.data;
  const s = status.data;

  if (!valid)
    return (
      <EmptyState title="Invalid case ID" action={<Link to="/incidents" className="text-accent">Back to incidents</Link>}>
        Case IDs look like <Mono>case-0123456789ab</Mono>.
      </EmptyState>
    );

  const specialists = r?.specialist_results ?? [];
  const activeSpec = specTab || specialists[0]?.agent_id || "";
  const models = Array.from(new Set((s?.agent_runs ?? []).map((a) => `${a.model_provider} · ${a.model_id}`)));

  return (
    <>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Link to="/incidents" className="text-xs text-muted no-underline hover:text-fg">
            ← Incidents
          </Link>
          <h1 className="m-0 flex flex-wrap items-center gap-3 text-[26px] font-bold">
            <Mono className="text-[24px] font-semibold">{caseId}</Mono>
            <RunStatusBadge status={r?.status ?? s?.job?.status ?? s?.status} />
            {r && <AssessmentBadge value={r.security_assessment} />}
          </h1>
          <p className="m-0 text-muted">{caseRow?.alert_summary ?? "Investigation case"}</p>
          <div className="flex flex-wrap gap-2">
            <SafetyBadges report={r} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={status.reload} icon={<Icon.Refresh size={15} />}>
            Refresh
          </Button>
          <Button disabled={!r} onClick={() => r && downloadJson(`${caseId}-report.json`, r)} icon={<Icon.Download size={15} />}>
            Export JSON
          </Button>
        </div>
      </section>

      {status.error && <ErrorState error={status.error} onRetry={status.reload} title={status.error.code === "CASE_NOT_FOUND" ? "Case not found" : "AI service unavailable"} />}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(280px,1.1fr)_minmax(0,2fr)_minmax(300px,1.3fr)]">
        {/* Left: case summary */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Case summary">
            {!status.settled ? (
              <LoadingRows rows={5} />
            ) : (
              <KeyValue
                items={[
                  ["Alert", caseRow?.alert_id ? <Mono>{caseRow.alert_id}</Mono> : "—"],
                  ["Alert severity", caseRow?.alert_level !== null && caseRow?.alert_level !== undefined ? <SeverityBadge level={caseRow.alert_level} /> : "—"],
                  ["Origin", humanize(caseRow?.origin)],
                  ["Opened", formatDateTime(s?.created_at ?? caseRow?.created_at)],
                  ["Last update", formatDateTime(s?.updated_at)],
                  ["Job", s?.job ? <span><Mono>{s.job.job_id}</Mono> · {humanize(s.job.status)} · attempt {s.job.attempts}</span> : "—"],
                  ["Model(s)", models.length ? models.map((m) => <Mono key={m} className="block">{m}</Mono>) : "—"],
                ]}
              />
            )}
          </Panel>
          <Panel title="Agent activity" aside={finished ? <span>Finished</span> : <span>Polling every 3 s</span>}>
            <InvestigationProgress status={s} reportReady={!!s?.report_ready} />
          </Panel>
          {caseRow && r && (caseRow.status === "completed" || caseRow.status === "partial" || r.status === "completed" || r.status === "partial") && (
            <ReviewPanel caseRow={caseRow} onDone={status.reload} />
          )}
        </div>

        {/* Centre: summary, evidence and timeline */}
        <div className="flex min-w-0 flex-col gap-5">
          {reportMissing ? (
            <ErrorState error={new ApiError("REPORT_UNAVAILABLE", "The investigation ended without a report.", 409)} title="Investigation failed" />
          ) : report.error ? (
            <ErrorState error={report.error} onRetry={report.reload} />
          ) : !r ? (
            <Panel title="Report">
              <EmptyState title="Investigation in progress" icon={<span className="block size-5 animate-spin rounded-full border-2 border-info border-t-transparent" />}>
                The report appears here when the Orchestrator has validated the specialists' results.
              </EmptyState>
            </Panel>
          ) : (
            <>
              <Panel title="Executive summary" aside={<Badge tone="info">AI-generated</Badge>}>
                <p className="m-0 text-[14px] leading-relaxed">{r.executive_summary}</p>
              </Panel>
              <Evidence report={r} />
              {specialists.length > 0 && (
                <Panel title="Specialist results" description="Each specialist ran its own bounded, read-only tool loop.">
                  <Tabs value={activeSpec} onChange={setSpecTab} tabs={specialists.map((sp) => ({ value: sp.agent_id, label: humanize(sp.agent_id) }))} />
                  {specialists.filter((sp) => sp.agent_id === activeSpec).map((sp) => (
                    <SpecialistResult key={sp.run_id} result={sp} />
                  ))}
                </Panel>
              )}
            </>
          )}
        </div>

        {/* Right: AI analysis */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title={<span className="flex items-center gap-2"><Icon.Sparkle size={15} className="text-accent" /> AI analysis</span>} aside={<Badge tone="info">Not verified fact</Badge>}>
            {!r ? (
              <LoadingRows rows={4} />
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <SectionLabel>Supported findings</SectionLabel>
                  <FindingsList facts={r.supported_findings} />
                </div>
                <div className="flex flex-col gap-2">
                  <SectionLabel>Hypotheses</SectionLabel>
                  <BulletList items={specialists.flatMap((sp) => sp.hypotheses.map((h) => `${h.statement} (${h.status})`))} empty="No hypotheses." />
                </div>
                <div className="flex flex-col gap-2">
                  <SectionLabel>Missing information</SectionLabel>
                  <BulletList items={r.unresolved_questions} empty="No open questions reported." marker="?" />
                </div>
                <div className="flex flex-col gap-2 rounded-lg border border-line bg-bg/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SectionLabel>Recommended next steps</SectionLabel>
                    <Badge tone="warn">Recommended · not executed</Badge>
                  </div>
                  <BulletList items={r.next_steps} empty="No next steps proposed." marker="→" />
                  <Link to="/soar" className="pt-1 text-[13px] text-accent no-underline hover:underline">
                    Review response options →
                  </Link>
                </div>
                <p className="m-0 text-[11.5px] text-subtle">Confidence is expressed qualitatively by the agents. Findings require analyst validation before any action.</p>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
