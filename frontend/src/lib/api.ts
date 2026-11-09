// Thin client for the Vigilance backend. The dashboard never talks to Wazuh
// or the agents service directly; everything goes through /api/v1.

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface ApiResult<T> {
  data: T;
  meta: Record<string, unknown>;
}

const BASE = "/api/v1";

export async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("BACKEND_UNREACHABLE", "The Vigilance backend is not reachable.", 0);
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // Vite's proxy answers 500/502 with an empty or HTML body when FastAPI is down.
    if (!res.ok) throw new ApiError("BACKEND_UNREACHABLE", "The Vigilance backend is not reachable.", res.status);
    throw new ApiError("BAD_RESPONSE", "The backend returned a response that is not JSON.", res.status);
  }

  if (!res.ok || body?.success === false) {
    const err = body?.error;
    if (err?.code) throw new ApiError(err.code, err.message ?? "Request failed.", res.status);
    // FastAPI validation errors: {"detail": [...]}
    const detail = Array.isArray(body?.detail) ? "The request was rejected as invalid." : typeof body?.detail === "string" ? body.detail : "Request failed.";
    throw new ApiError(res.status === 422 ? "VALIDATION_ERROR" : `HTTP_${res.status}`, detail, res.status);
  }

  const { success: _s, data, meta, ...rest } = body ?? {};
  return { data: (data ?? body) as T, meta: { ...rest, ...(meta ?? {}) } };
}

export const post = <T>(path: string, payload?: unknown) =>
  api<T>(path, { method: "POST", body: payload === undefined ? undefined : JSON.stringify(payload) });

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
