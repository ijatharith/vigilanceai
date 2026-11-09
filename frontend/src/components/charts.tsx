import { useState } from "react";
import { SEVERITIES, SEVERITY_LABEL, formatDateTime, formatTime } from "../lib/format";
import type { ActivityBucket, Severity } from "../lib/types";
import { Table, tdClass } from "./ui";

export const SEV_FILL: Record<Severity, string> = {
  critical: "var(--color-sev-critical)",
  high: "var(--color-sev-high)",
  medium: "var(--color-sev-medium)",
  low: "var(--color-sev-low)",
};

export function SeverityLegend() {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
      {SEVERITIES.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: SEV_FILL[s] }} aria-hidden="true" />
          {SEVERITY_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}

/** Smallest "nice" axis max with 4 equal ticks that fits n. */
function niceMax(n: number): number {
  if (n <= 4) return 4;
  const raw = n / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 5, 10].find((s) => s * pow >= raw) ?? 10;
  return step * pow * 4;
}

/** Stacked hourly bars. Bottom-to-top: low, medium, high, critical. */
export function ActivityChart({ buckets, showTable }: { buckets: ActivityBucket[]; showTable: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 220;
  const pad = { l: 34, r: 8, t: 10, b: 26 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const totals = buckets.map((b) => b.critical + b.high + b.medium + b.low);
  const max = niceMax(Math.max(1, ...totals));
  const slot = innerW / buckets.length;
  const barW = Math.max(4, Math.min(22, slot - 4));
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const stackOrder: Severity[] = ["low", "medium", "high", "critical"];

  if (showTable) {
    return (
      <Table head={["Hour (local)", "Critical", "High", "Medium", "Low", "Total"]} minWidth="min-w-120">
        {buckets
          .map((b, i) => ({ b, t: totals[i] }))
          .filter((r) => r.t > 0)
          .map(({ b, t }) => (
            <tr key={b.hour}>
              <td className={tdClass}>{formatDateTime(b.hour)}</td>
              {SEVERITIES.map((s) => (
                <td key={s} className={`${tdClass} tabular-nums`}>
                  {b[s]}
                </td>
              ))}
              <td className={`${tdClass} font-semibold tabular-nums`}>{t}</td>
            </tr>
          ))}
      </Table>
    );
  }

  const hb = hover !== null ? buckets[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Stored alerts per hour, stacked by severity">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={t === 0 ? 1 : 0.6} strokeDasharray={t === 0 ? undefined : "2 4"} />
            <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-subtle)">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x = pad.l + i * slot + (slot - barW) / 2;
          let acc = 0;
          const segs = stackOrder.filter((s) => b[s] > 0);
          return (
            <g key={b.hour}>
              {segs.map((s, si) => {
                const y0 = y(acc);
                acc += b[s];
                const y1 = y(acc);
                const h = Math.max(1, y0 - y1 - (si < segs.length - 1 ? 2 : 0)); // 2px surface gap between segments
                const top = si === segs.length - 1;
                return (
                  <path
                    key={s}
                    d={top ? roundedTop(x, y1, barW, h, Math.min(4, barW / 2, h)) : `M${x},${y1}h${barW}v${h}h${-barW}z`}
                    fill={SEV_FILL[s]}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                );
              })}
              {(i % 4 === 0 || i === buckets.length - 1) && (
                <text x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-subtle)">
                  {formatTime(b.hour)}
                </text>
              )}
              {/* Hit target: full column height, wider than the mark. */}
              <rect
                x={pad.l + i * slot}
                y={pad.t}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={totals[i] > 0 ? 0 : -1}
                aria-label={`${formatDateTime(b.hour)}: ${totals[i]} alerts`}
              />
            </g>
          );
        })}
      </svg>
      {hb && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 flex min-w-40 flex-col gap-1 rounded-lg border border-line bg-elevated px-3 py-2 text-xs shadow-xl"
          style={{ left: `clamp(0px, calc(${((pad.l + hover * slot + slot / 2) / W) * 100}% - 80px), calc(100% - 170px))` }}
        >
          <span className="font-semibold text-fg">{formatDateTime(hb.hour)}</span>
          {SEVERITIES.map((s) => (
            <span key={s} className="flex items-center justify-between gap-4 text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: SEV_FILL[s] }} aria-hidden="true" />
                {SEVERITY_LABEL[s]}
              </span>
              <span className="tabular-nums text-fg">{hb[s]}</span>
            </span>
          ))}
          <span className="flex justify-between border-t border-line pt-1 text-muted">
            Total <span className="tabular-nums font-semibold text-fg">{totals[hover]}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Horizontal magnitude bars, one per severity, with direct value labels. */
export function SeverityDistribution({ counts }: { counts: Record<Severity, number> }) {
  const total = SEVERITIES.reduce((n, s) => n + counts[s], 0);
  const max = Math.max(1, ...SEVERITIES.map((s) => counts[s]));
  return (
    <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
      {SEVERITIES.map((s) => {
        const pct = total ? Math.round((counts[s] / total) * 100) : 0;
        return (
          <li key={s} className="flex flex-col gap-1.5" title={`${SEVERITY_LABEL[s]}: ${counts[s]} (${pct}%)`}>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-[3px]" style={{ background: SEV_FILL[s] }} aria-hidden="true" />
                {SEVERITY_LABEL[s]}
              </span>
              <span className="tabular-nums text-muted">
                <span className="font-semibold text-fg">{counts[s]}</span> · {pct}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-elevated">
              <div className="h-2 rounded-full" style={{ width: `${(counts[s] / max) * 100}%`, minWidth: counts[s] ? 4 : 0, background: SEV_FILL[s] }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
