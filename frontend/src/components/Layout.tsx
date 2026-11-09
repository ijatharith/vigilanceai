import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useApp } from "../lib/appContext";
import { formatRelative } from "../lib/format";
import { Icon } from "./icons";
import { Button, Mono, SERVICE_LABEL, ServiceDot } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  badgeTone?: "critical" | "warn";
}

const SERVICE_NAMES: Record<string, string> = {
  database: "PostgreSQL",
  wazuh_manager: "Wazuh Manager",
  wazuh_indexer: "Wazuh Indexer",
  vigil_agents: "VIGIL agents",
};

function readCollapsed(): boolean {
  try {
    return localStorage.getItem("vigilance.sidebar") === "collapsed";
  } catch {
    return false;
  }
}

function Sidebar({ collapsed, onToggle, mobileOpen, onNavigate }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onNavigate: () => void }) {
  const { stats } = useApp();
  const nav: NavItem[] = [
    { to: "/dashboard", label: "Overview", icon: <Icon.Overview /> },
    { to: "/alerts", label: "Security Alerts", icon: <Icon.Alert />, badge: stats?.critical_alerts, badgeTone: "critical" },
    { to: "/incidents", label: "Incidents", icon: <Icon.Incident />, badge: stats?.investigations.awaiting_review, badgeTone: "warn" },
    { to: "/ai-analyst", label: "AI Analyst", icon: <Icon.Bot /> },
    { to: "/soar", label: "SOAR Automation", icon: <Icon.Bolt /> },
    { to: "/endpoints", label: "Endpoints", icon: <Icon.Monitor /> },
    { to: "/audit-logs", label: "Audit Logs", icon: <Icon.Log /> },
    { to: "/settings", label: "Settings", icon: <Icon.Settings /> },
  ];

  return (
    <nav
      aria-label="Main"
      className={`fixed inset-y-0 left-0 z-30 flex flex-col gap-4 border-r border-line bg-surface py-4 transition-[width,transform] lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
        collapsed ? "w-62 lg:w-18 px-3.5 lg:px-2.5" : "w-62 px-3.5"
      } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className={`flex items-center gap-2.5 py-1 ${collapsed ? "lg:justify-center" : "px-2"}`}>
        <span className="text-primary">
          <Icon.Logo size={28} />
        </span>
        <div className={`flex flex-col ${collapsed ? "lg:hidden" : ""}`}>
          <span className="text-base font-bold tracking-wide">Vigilance</span>
          <span className="text-[11px] text-muted">Detect. Investigate. Respond.</span>
        </div>
      </div>

      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {nav.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `relative flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-[13.5px] no-underline ${collapsed ? "lg:justify-center lg:px-0" : ""} ${
                  isActive ? "bg-elevated font-semibold text-fg [&_svg]:text-primary" : "text-muted hover:bg-hover hover:text-fg"
                }`
              }
            >
              {item.icon}
              <span className={collapsed ? "lg:sr-only" : ""}>{item.label}</span>
              {!!item.badge && (
                <span
                  className={`ml-auto rounded-full px-1.5 text-[10.5px] font-bold tabular-nums ${
                    item.badgeTone === "critical" ? "bg-red-950 text-red-300" : "bg-warn-bg text-warn"
                  } ${collapsed ? "lg:absolute lg:right-1 lg:top-1 lg:ml-0" : ""}`}
                  aria-label={`${item.badge} ${item.badgeTone === "critical" ? "critical" : "awaiting review"}`}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2">
        <div className={`flex flex-col gap-1 rounded-lg border border-line p-3 ${collapsed ? "lg:hidden" : ""}`}>
          <span className="text-xs font-medium">Local analyst</span>
          <span className="text-[11px] text-subtle">No authentication (localhost only)</span>
          <Mono className="text-[11px] text-subtle">Vigilance 0.1.0 · FYP</Mono>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle} className="hidden lg:inline-flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} icon={collapsed ? <Icon.ChevronRight size={16} /> : <Icon.ChevronLeft size={16} />}>
          <span className={collapsed ? "sr-only" : ""}>Collapse</span>
        </Button>
      </div>
    </nav>
  );
}

function HealthIndicator() {
  const { health, healthError, reloadHealth } = useApp();
  const [open, setOpen] = useState(false);
  const overall = healthError ? "down" : health?.overall;
  const label = !overall ? "Checking…" : overall === "healthy" ? "All systems connected" : overall === "degraded" ? "Partially connected" : "Disconnected";
  const dot = !overall ? "bg-subtle" : overall === "healthy" ? "bg-ok" : overall === "degraded" ? "bg-warn" : "bg-fail";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs text-muted hover:text-fg"
      >
        <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">Health</span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 flex w-80 flex-col gap-3 rounded-xl border border-line bg-elevated p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">Integration health</span>
            <Button size="sm" variant="ghost" onClick={reloadHealth} icon={<Icon.Refresh size={14} />}>
              Recheck
            </Button>
          </div>
          {healthError ? (
            <p className="m-0 text-[13px] text-fail">{healthError.message}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              <li className="flex items-center justify-between gap-2 text-[13px]">
                <span className="flex items-center gap-2">
                  <ServiceDot status={health ? "connected" : "unknown"} /> Vigilance backend
                </span>
                <span className="text-xs text-muted">{health ? "Running" : "Unknown"}</span>
              </li>
              {health &&
                Object.values(health.services).map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="flex items-center gap-2">
                      <ServiceDot status={s.status} /> {SERVICE_NAMES[s.name] ?? s.name}
                    </span>
                    <span className="text-xs text-muted">
                      {SERVICE_LABEL[s.status]}
                      {s.latency_ms !== null && s.status === "connected" ? ` · ${s.latency_ms} ms` : ""}
                    </span>
                  </li>
                ))}
              <li className="flex items-center justify-between gap-2 text-[13px]">
                <span className="flex items-center gap-2">
                  <ServiceDot status="not_configured" /> n8n / SOAR
                </span>
                <span className="text-xs text-muted">Planned (Phase 5)</span>
              </li>
            </ul>
          )}
          <span className="text-[11px] text-subtle">Checked every 30 s by the backend. Statuses are live, not sample data.</span>
        </div>
      )}
    </div>
  );
}

const CRUMBS: Record<string, string> = {
  dashboard: "Overview",
  alerts: "Security Alerts",
  incidents: "Incidents",
  "ai-analyst": "AI Analyst",
  soar: "SOAR Automation",
  endpoints: "Endpoints",
  "audit-logs": "Audit Logs",
  settings: "Settings",
};

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { stats } = useApp();
  const [q, setQ] = useState("");
  const parts = pathname.split("/").filter(Boolean);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    if (/^case-[0-9a-f]{12}$/.test(term)) navigate(`/incidents/${term}`);
    else navigate(`/alerts?q=${encodeURIComponent(term)}`);
    setQ("");
  };

  return (
    <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-3 border-b border-line bg-bg/95 px-4 py-2.5 backdrop-blur sm:px-7">
      <Button variant="ghost" size="sm" className="lg:hidden" onClick={onMenu} aria-label="Open navigation" icon={<Icon.Menu />} />
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 truncate text-[13px] text-muted">
        <span>Vigilance</span>
        {parts.map((p, i) => (
          <span key={i}>
            <span aria-hidden="true" className="px-1.5 text-subtle">/</span>
            <span className={i === parts.length - 1 ? "text-fg" : ""}>{CRUMBS[p] ?? (p.startsWith("case-") ? <Mono>{p}</Mono> : p)}</span>
          </span>
        ))}
      </nav>
      <form onSubmit={submit} role="search" className="order-last flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 sm:order-none sm:w-72">
        <Icon.Search size={15} className="text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search alerts or case-…"
          aria-label="Global search"
          className="min-h-9 w-full border-0 bg-transparent text-[13px] text-fg outline-none placeholder:text-subtle"
        />
      </form>
      {stats?.latest_alert_at && (
        <span className="hidden text-xs text-subtle xl:inline" title="Timestamp of the newest alert stored in PostgreSQL">
          Newest stored alert {formatRelative(stats.latest_alert_at)}
        </span>
      )}
      <HealthIndicator />
    </header>
  );
}

function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-xl border bg-elevated px-4 py-3 shadow-2xl ${t.tone === "fail" ? "border-fail/40" : t.tone === "ok" ? "border-ok/30" : "border-line"}`}
        >
          <span className={`pt-0.5 ${t.tone === "fail" ? "text-fail" : t.tone === "ok" ? "text-ok" : "text-info"}`}>
            {t.tone === "fail" ? <Icon.X size={16} /> : t.tone === "ok" ? <Icon.Check size={16} /> : <Icon.Info size={16} />}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-semibold">{t.title}</span>
            {t.body && <span className="text-xs text-muted">{t.body}</span>}
          </div>
          <button type="button" onClick={() => dismiss(t.id)} className="cursor-pointer border-0 bg-transparent text-subtle hover:text-fg" aria-label="Dismiss">
            <Icon.Close size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    try {
      localStorage.setItem("vigilance.sidebar", collapsed ? "collapsed" : "expanded");
    } catch {
      /* storage unavailable: preference just isn't remembered */
    }
  }, [collapsed]);

  useEffect(() => {
    // Block body: newer browsers return a Promise from scrollTo, which React
    // would otherwise treat as an effect cleanup.
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      {mobileOpen && <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto flex w-full max-w-400 flex-col gap-6 px-4 pb-14 pt-7 sm:px-7">
          <Outlet />
        </main>
      </div>
      <Toasts />
    </div>
  );
}
