import type { Severity } from "./types";

/** Wazuh rule level -> severity group. Same thresholds as the backend stats. */
export function levelToSeverity(level: number | null | undefined): Severity | null {
  if (level === null || level === undefined) return null;
  if (level >= 12) return "critical";
  if (level >= 10) return "high";
  if (level >= 7) return "medium";
  return "low";
}

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Wazuh uses +0000 offsets; normalise to +00:00 for Date parsing.
  const d = new Date(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(value: string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatTime(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
}

export function formatRelative(value: string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  if (d.getFullYear() >= 9999) return "Always (manager)";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 0) return formatDateTime(value);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
