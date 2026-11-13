import "server-only";
import type { ProviderId, ProviderInfo } from "@/types/market";
import { AngelOneProvider } from "./angelone";
import type { BaseProvider } from "./base";
import { env } from "./env";
import { GrowwProvider } from "./groww";
import { YahooProvider } from "./yahoo";

const instances: Partial<Record<ProviderId, BaseProvider>> = {};

export function getProvider(id: ProviderId): BaseProvider {
  return (instances[id] ??= id === "angelone" ? new AngelOneProvider() : id === "groww" ? new GrowwProvider() : new YahooProvider());
}

export const PROVIDER_IDS: ProviderId[] = ["angelone", "groww", "yahoo"];

/** Yahoo can be switched off completely with YAHOO_ENABLED=false. */
export function yahooEnabled(): boolean {
  return env("YAHOO_ENABLED").toLowerCase() !== "false";
}

/** Whether Yahoo may answer when the chosen broker API fails (always shown to the user when it happens). */
export function yahooFallbackEnabled(): boolean {
  return yahooEnabled() && env("YAHOO_FALLBACK").toLowerCase() !== "false";
}

export interface Selection {
  /** The source that will be asked first; null when nothing usable is configured. */
  primary: ProviderId | null;
  /** How it was chosen: named in MARKET_DATA_PROVIDER, or picked automatically. */
  mode: "explicit" | "auto";
  /** A problem with the configuration itself, in plain words. */
  problem: string | null;
}

/**
 * MARKET_DATA_PROVIDER=angelone | groww | yahoo picks the source. When it is not set:
 * Angel One if its keys are present, otherwise Groww, otherwise Yahoo (unless disabled).
 */
export function selectProvider(): Selection {
  const named = env("MARKET_DATA_PROVIDER").toLowerCase();
  if (named) {
    if (!PROVIDER_IDS.includes(named as ProviderId)) {
      return { primary: null, mode: "explicit", problem: `MARKET_DATA_PROVIDER is "${named}". Use angelone, groww or yahoo.` };
    }
    if (named === "yahoo" && !yahooEnabled()) return { primary: null, mode: "explicit", problem: "MARKET_DATA_PROVIDER is yahoo but YAHOO_ENABLED is false." };
    return { primary: named as ProviderId, mode: "explicit", problem: null };
  }
  for (const id of ["angelone", "groww"] as const) if (!getProvider(id).missingEnv().length) return { primary: id, mode: "auto", problem: null };
  if (yahooEnabled()) return { primary: "yahoo", mode: "auto", problem: null };
  return { primary: null, mode: "auto", problem: "No market-data source is configured and Yahoo is switched off." };
}

export function providerInfos(): ProviderInfo[] {
  return PROVIDER_IDS.map((id) => {
    const p = getProvider(id);
    const miss = p.missingEnv();
    const off = id === "yahoo" && !yahooEnabled();
    return { id, name: p.name, official: p.official, delayed: p.delayed, configured: !miss.length && !off, missing: miss, note: off ? "Switched off (YAHOO_ENABLED=false)." : p.note };
  });
}
