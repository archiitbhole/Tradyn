import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import type { ApiError, ApiResponse, ErrorCode, ResponseMeta } from "@/types/market";
import { isProviderError, ProviderError } from "@/lib/providers/errors";
import { clientId, rateLimit } from "./rate-limit";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400, UNAUTHENTICATED: 401, NOT_FOUND: 404, RATE_LIMITED: 429, NOT_CONFIGURED: 503,
  AUTH_FAILED: 502, PROVIDER_ERROR: 502, PROVIDER_UNREACHABLE: 504, INTERNAL: 500,
};

export function ok<T>(data: T, opts: { meta?: ResponseMeta; cacheSeconds?: number; status?: number } = {}): NextResponse<ApiResponse<T>> {
  const s = opts.cacheSeconds ?? 0;
  return NextResponse.json({ ok: true, data, meta: opts.meta } as ApiResponse<T>, {
    status: opts.status ?? 200,
    headers: { "Cache-Control": s > 0 ? `public, s-maxage=${s}, stale-while-revalidate=${s * 2}` : "no-store" },
  });
}

export function fail(error: ApiError, extra: Record<string, string> = {}): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false, error } as ApiResponse<never>, { status: STATUS[error.code], headers: { "Cache-Control": "no-store", ...extra } });
}

/** Turns anything thrown into a safe reply. Unknown errors are logged by name only and answered generically. */
export function failFrom(e: unknown, route: string): NextResponse<ApiResponse<never>> {
  if (isProviderError(e)) return fail({ code: e.code, message: e.message, provider: e.provider, missing: e.missing });
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    return fail({ code: "BAD_REQUEST", message: issue ? `${issue.path.join(".") || "request"}: ${issue.message}` : "Invalid request." });
  }
  // Safe logging: the error's type and route, never request bodies, headers, tokens or provider replies.
  console.error(`[tradyn] ${route} failed: ${e instanceof Error ? e.name : "unknown error"}`);
  return fail({ code: "INTERNAL", message: "Something went wrong on the server. Please try again." });
}

interface Guard {
  route: string;
  /** Requests allowed per client per minute. */
  limit?: number;
  bucket?: string;
  /** Require the request to come from this site's own pages (for routes that change data or use the sign-in cookie). */
  sameOrigin?: boolean;
}

export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

/** Wraps a route: rate limit, optional same-origin check, and uniform error replies. */
export async function guarded(req: NextRequest, g: Guard, run: () => Promise<NextResponse>): Promise<NextResponse> {
  // Default 600 requests a minute per IP: generous because whole classrooms and offices share one
  // public IP; sign-in routes use a much stricter bucket.
  const rl = rateLimit(clientId(req.headers), g.bucket ?? "data", g.limit ?? 600);
  if (!rl.ok) return fail({ code: "RATE_LIMITED", message: `Too many requests. Try again in ${rl.retryAfter} seconds.` }, { "Retry-After": String(rl.retryAfter) });
  if (g.sameOrigin && !sameOrigin(req)) return fail({ code: "BAD_REQUEST", message: "Cross-site request blocked." });
  try {
    return await run();
  } catch (e) {
    return failFrom(e, g.route);
  }
}

export async function jsonBody(req: NextRequest, maxBytes = 8 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ProviderError("BAD_REQUEST", "Request is too large.");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new ProviderError("BAD_REQUEST", "Request body is not valid JSON.");
  }
}
