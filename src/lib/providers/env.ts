import "server-only";

/** Reads a server-side environment variable. Empty and whitespace-only values count as not set. */
export function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function missing(names: string[]): string[] {
  return names.filter((n) => !env(n));
}
