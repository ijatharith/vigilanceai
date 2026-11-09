import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

export interface ApiState<T> {
  data: T | undefined;
  meta: Record<string, unknown>;
  error: ApiError | null;
  loading: boolean;
  /** True once the first request has settled (success or error). */
  settled: boolean;
  reload: () => void;
}

/**
 * GET a backend path. `path = null` skips the request. With `interval`, polls
 * while the tab is visible. Previous data is kept during refreshes so the UI
 * does not flash back to a skeleton.
 */
export function useApi<T>(path: string | null, opts: { interval?: number } = {}): ApiState<T> {
  const [data, setData] = useState<T>();
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [settled, setSettled] = useState(false);
  const [tick, setTick] = useState(0);
  const pathRef = useRef(path);

  useEffect(() => {
    if (pathRef.current !== path) {
      pathRef.current = path;
      setData(undefined);
      setSettled(false);
      setError(null);
    }
    if (path === null) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    api<T>(path, { signal: ctrl.signal })
      .then((r) => {
        setData(r.data);
        setMeta(r.meta);
        setError(null);
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof ApiError ? e : new ApiError("UNKNOWN", "Request failed.", 0));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) {
          setLoading(false);
          setSettled(true);
        }
      });
    return () => ctrl.abort();
  }, [path, tick]);

  useEffect(() => {
    if (!opts.interval || path === null) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    }, opts.interval);
    return () => window.clearInterval(id);
  }, [opts.interval, path]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, meta, error, loading, settled, reload };
}
