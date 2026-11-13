"use client";
import useSWR, { type SWRConfiguration } from "swr";
import type { ApiError, ApiResponse, ResponseMeta } from "@/types/market";

export class ApiClientError extends Error {
  readonly error: ApiError;
  readonly status: number;
  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = "ApiClientError";
    this.error = error;
    this.status = status;
  }
}

export interface Payload<T> {
  data: T;
  meta?: ResponseMeta;
}

/** Calls one of this app's own /api routes and unwraps the { ok, data | error } envelope. */
export async function apiFetch<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<Payload<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: init?.json !== undefined ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError({ code: "PROVIDER_UNREACHABLE", message: "Could not reach the Tradyn server. Check your internet connection." }, 0);
  }
  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    // fall through
  }
  if (!body) throw new ApiClientError({ code: "INTERNAL", message: `The server sent an unexpected reply (HTTP ${res.status}).` }, res.status);
  if (!body.ok) throw new ApiClientError(body.error, res.status);
  return { data: body.data, meta: body.meta };
}

const noRetry = new Set(["NOT_CONFIGURED", "BAD_REQUEST", "NOT_FOUND", "UNAUTHENTICATED", "AUTH_FAILED"]);

export function useApi<T>(url: string | null, opts: { refreshMs?: number } & SWRConfiguration<Payload<T>, ApiClientError> = {}) {
  const { refreshMs, ...rest } = opts;
  const swr = useSWR<Payload<T>, ApiClientError>(url, (u: string) => apiFetch<T>(u), {
    refreshInterval: refreshMs || 0,
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 2000,
    shouldRetryOnError: (e) => !noRetry.has(e.error.code),
    errorRetryCount: 3,
    errorRetryInterval: 8000,
    ...rest,
  });
  return { data: swr.data?.data, meta: swr.data?.meta, error: swr.error?.error, loading: swr.isLoading, refreshing: swr.isValidating, reload: () => swr.mutate() };
}
