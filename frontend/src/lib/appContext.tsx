import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { ApiError } from "./api";
import type { DashboardStats, Health } from "./types";
import { useApi } from "./useApi";

export interface Toast {
  id: number;
  tone: "ok" | "fail" | "info";
  title: string;
  body?: string;
}

interface AppState {
  health: Health | undefined;
  healthError: ApiError | null;
  reloadHealth: () => void;
  stats: DashboardStats | undefined;
  reloadStats: () => void;
  toasts: Toast[];
  notify: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const health = useApi<Health>("/health", { interval: 30_000 });
  const stats = useApi<DashboardStats>("/dashboard/stats", { interval: 60_000 });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  const value = useMemo<AppState>(
    () => ({
      health: health.data,
      healthError: health.error,
      reloadHealth: health.reload,
      stats: stats.data,
      reloadStats: stats.reload,
      toasts,
      notify,
      dismiss,
    }),
    [health.data, health.error, health.reload, stats.data, stats.reload, toasts, notify, dismiss],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
