"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** False while rendering on the server and during hydration, true afterwards. */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
