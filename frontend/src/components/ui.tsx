import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ApiError } from "../lib/api";
import { SEVERITY_LABEL, humanize, levelToSeverity } from "../lib/format";
import type { Assessment, ReviewDecision, ServiceStatus, Severity } from "../lib/types";
import { Icon } from "./icons";

// ---- Primitives ---------------------------------------------------------

export type Tone = "ok" | "warn" | "fail" | "info" | "neutral" | "primary";

const toneClasses: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  fail: "bg-fail-bg text-fail",
  info: "bg-info-bg text-info",
  neutral: "bg-elevated text-slate-300",
  primary: "bg-primary-soft/40 text-accent",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[12.5px] ${className}`}>{children}</span>;
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const btnClasses: Record<BtnVariant, string> = {
  primary: "border-transparent bg-primary text-white hover:bg-primary-soft",
  secondary: "border-line bg-surface text-fg hover:bg-hover",
  ghost: "border-transparent bg-transparent text-muted hover:bg-hover hover:text-fg",
  danger: "border-fail/40 bg-fail-bg text-fail hover:bg-fail-bg/70",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md"; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "sm" ? "min-h-8 px-2.5 text-xs" : "min-h-10 px-3.5 text-[13px]"
      } ${btnClasses[variant]} ${className}`}
    >
      {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function Panel({
  title,
  aside,
  description,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-xl border border-line bg-surface ${className}`}>
      {(title || aside) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          {title && <h2 className="m-0 text-[15px] font-semibold">{title}</h2>}
          {aside && <div className="flex items-center gap-2 text-xs text-muted">{aside}</div>}
        </div>
      )}
      {description && <p className="m-0 px-5 pt-1 text-[13px] text-muted">{description}</p>}
      <div className={`flex min-w-0 flex-col gap-3 p-5 ${title ? "pt-3.5" : ""} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, tags }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; tags?: ReactNode }) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {tags && <div className="flex flex-wrap gap-2">{tags}</div>}
        <h1 className="m-0 text-[28px] font-bold leading-tight">{title}</h1>
        {subtitle && <p className="m-0 max-w-200 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}

/** Says where a panel's data comes from (operational honesty rule). */
export function SourceTag({ children, kind = "live" }: { children: ReactNode; kind?: "live" | "demo" | "planned" | "cached" }) {
  const cls = {
    live: "bg-ok-bg text-ok",
    demo: "bg-warn-bg text-warn",
    planned: "bg-elevated text-muted",
    cached: "bg-info-bg text-info",
  }[kind];
  return <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${cls}`}>{children}</span>;
}

// ---- Domain badges ------------------------------------------------------

const sevShape: Record<Severity, string> = { critical: "◆", high: "▲", medium: "■", low: "●" };
const sevText: Record<Severity, string> = {
  critical: "text-red-300 bg-red-950/70",
  high: "text-orange-300 bg-orange-950/60",
  medium: "text-yellow-300 bg-yellow-950/50",
  low: "text-blue-300 bg-blue-950/60",
};

export function SeverityBadge({ level, severity }: { level?: number | null; severity?: Severity | null }) {
  const sev = severity ?? levelToSeverity(level);
  if (!sev) return <Badge>Unknown</Badge>;
  return (
    <span className={`inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${sevText[sev]}`}>
      <span aria-hidden="true" className="text-[9px]">{sevShape[sev]}</span>
      {SEVERITY_LABEL[sev]}
      {level !== undefined && level !== null && <span className="font-mono font-normal opacity-75">L{level}</span>}
    </span>
  );
}

export function RunStatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, Tone> = { queued: "neutral", running: "info", completed: "ok", partial: "warn", failed: "fail", cancelled: "neutral" };
  const s = status ?? "unknown";
  return (
    <Badge tone={map[s] ?? "neutral"}>
      {s === "running" && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />}
      {humanize(s)}
    </Badge>
  );
}

export function AssessmentBadge({ value }: { value: Assessment | null | undefined }) {
  if (!value) return <span className="text-xs text-subtle">Pending</span>;
  const map: Record<Assessment, Tone> = { suspicious: "fail", benign: "ok", unknown: "neutral", inconclusive: "warn" };
  return <Badge tone={map[value]} title="AI assessment — requires analyst review">AI: {humanize(value)}</Badge>;
}

export function ReviewBadge({ value }: { value: ReviewDecision | null | undefined }) {
  if (!value) return <Badge tone="warn">Awaiting review</Badge>;
  const map: Record<ReviewDecision, [Tone, string]> = {
    findings_accepted: ["ok", "Findings accepted"],
    findings_rejected: ["neutral", "Findings rejected"],
    escalated: ["fail", "Escalated"],
  };
  const [tone, label] = map[value];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ServiceDot({ status }: { status: ServiceStatus | "unknown" }) {
  const cls = { connected: "bg-ok", unavailable: "bg-fail", not_configured: "bg-subtle", unknown: "bg-subtle" }[status];
  return <span className={`inline-block size-2 flex-none rounded-full ${cls}`} aria-hidden="true" />;
}

export const SERVICE_LABEL: Record<ServiceStatus | "unknown", string> = {
  connected: "Connected",
  unavailable: "Unavailable",
  not_configured: "Not configured",
  unknown: "Unknown",
};

// ---- States -------------------------------------------------------------

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-6 py-9 text-center">
      <span className="text-subtle">{icon ?? <Icon.Info size={22} />}</span>
      <p className="m-0 text-sm font-semibold">{title}</p>
      {children && <div className="m-0 max-w-120 text-[13px] text-muted">{children}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

const ERROR_HINTS: Record<string, string> = {
  BACKEND_UNREACHABLE: "Start the backend: cd backend; .\\venv\\Scripts\\Activate.ps1; uvicorn app.main:app --reload",
  AGENTS_UNAVAILABLE: "Start the agents service: vigil serve --port 8100, and in a second shell: vigil worker",
  AGENTS_NOT_CONFIGURED: "Set VIGIL_AGENTS_TOKEN in backend/.env to the agents service's VIGIL_API_TOKEN.",
  AGENTS_AUTH_FAILED: "VIGIL_AGENTS_TOKEN in backend/.env does not match the agents service's VIGIL_API_TOKEN.",
  DATABASE_UNAVAILABLE: "Check that PostgreSQL is running and DATABASE_URL in backend/.env is correct.",
  WAZUH_INDEXER_UNAVAILABLE: "Check WAZUH_INDEXER_URL in backend/.env and that the Wazuh VM is running.",
  WAZUH_MANAGER_UNAVAILABLE: "Check WAZUH_API_URL in backend/.env and that the Wazuh VM is running.",
};

/** Error / disconnected / AI-unavailable state. Shows the safe backend code. */
export function ErrorState({ error, onRetry, title }: { error: ApiError; onRetry?: () => void; title?: string }) {
  const disconnected = /UNAVAILABLE|UNREACHABLE|TIMEOUT|NOT_CONFIGURED/.test(error.code);
  const hint = ERROR_HINTS[error.code];
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-lg border border-fail/30 bg-fail-bg/40 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-fail">{disconnected ? <Icon.Plug size={16} /> : <Icon.X size={16} />}</span>
        <span className="text-sm font-semibold">{title ?? (disconnected ? "Service disconnected" : "Something went wrong")}</span>
        <Mono className="text-xs text-muted">{error.code}</Mono>
      </div>
      <p className="m-0 text-[13px] text-slate-300">{error.message}</p>
      {hint && <p className="m-0 font-mono text-xs text-muted">{hint}</p>}
      {onRetry && (
        <div>
          <Button size="sm" onClick={onRetry} icon={<Icon.Refresh size={14} />}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn"; title: string; children?: ReactNode }) {
  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 ${tone === "warn" ? "border-warn/30 bg-warn-bg/50" : "border-info/25 bg-info-bg/50"}`}>
      <span className={`pt-0.5 ${tone === "warn" ? "text-warn" : "text-info"}`}>
        <Icon.Info size={16} />
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold">{title}</span>
        {children && <div className="text-[13px] text-muted">{children}</div>}
      </div>
    </div>
  );
}

// ---- Data display -------------------------------------------------------

export function Kpi({ label, value, sub, loading, tone }: { label: string; value: ReactNode; sub?: ReactNode; loading?: boolean; tone?: "critical" | "warn" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-surface p-4">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <span className={`text-[30px] font-bold leading-none tabular-nums ${tone === "critical" ? "text-red-300" : tone === "warn" ? "text-warn" : ""}`}>{value}</span>
      )}
      {sub && <span className="text-xs text-subtle">{sub}</span>}
    </div>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-[13px]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 min-w-0 break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Raw, untrusted data: always rendered as text, never as HTML. */
export function JsonBlock({ value, maxHeight = "max-h-96" }: { value: unknown; maxHeight?: string }) {
  return (
    <pre className={`m-0 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed text-slate-300 ${maxHeight}`}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function Table({ head, children, minWidth = "min-w-180" }: { head: ReactNode[]; children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className={`w-full border-collapse text-left text-[13px] ${minWidth}`}>
        <thead className="bg-elevated/60 text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3.5 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-line">{children}</tbody>
      </table>
    </div>
  );
}

export const tdClass = "px-3.5 py-3 align-middle";
export const rowButtonClass = "cursor-pointer hover:bg-hover/50 focus-visible:bg-hover/50";

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-10 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-fg"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextInput({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input {...rest} className={`min-h-10 rounded-lg border border-line bg-surface px-3 text-[13px] text-fg placeholder:text-subtle ${rest.className ?? ""}`} />
    </label>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[] }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`min-h-9 cursor-pointer rounded-md border-0 px-3 text-[13px] ${
            value === t.value ? "bg-elevated font-semibold text-fg" : "bg-transparent text-muted hover:text-fg"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---- Overlays -----------------------------------------------------------

export function Drawer({ open, onClose, title, subtitle, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className="relative flex h-full w-full max-w-160 flex-col border-l border-line bg-surface shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="m-0 text-base font-semibold">{title}</h2>
            {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel" icon={<Icon.Close size={16} />} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="m-0 text-[11px] font-semibold uppercase tracking-widest text-subtle">{children}</h3>;
}

export function Pagination({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted">
      <span>
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))} aria-label="Previous page" icon={<Icon.ChevronLeft size={14} />} />
        <span>
          Page {page} / {pages}
        </span>
        <Button size="sm" disabled={page >= pages} onClick={() => onChange(offset + limit)} aria-label="Next page" icon={<Icon.ChevronRight size={14} />} />
      </div>
    </div>
  );
}
