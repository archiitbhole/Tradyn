import type { ErrorCode, ProviderId } from "@/types/market";

/** An error that is safe to show to the user: it never contains credentials or internal details. */
export class ProviderError extends Error {
  readonly code: ErrorCode;
  readonly provider?: ProviderId;
  readonly missing?: string[];

  constructor(code: ErrorCode, message: string, opts: { provider?: ProviderId; missing?: string[] } = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.provider = opts.provider;
    this.missing = opts.missing;
  }
}

export function isProviderError(e: unknown): e is ProviderError {
  return e instanceof ProviderError;
}
