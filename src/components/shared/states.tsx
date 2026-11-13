"use client";
import { CloudOff, KeyRound, type LucideIcon, RefreshCw, SearchX, ServerCrash, Timer } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconTile, type Tone } from "@/components/ui/icon-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import type { ApiError } from "@/types/market";

const LOOK: Record<ApiError["code"], { icon: LucideIcon; title: string; tone: Tone }> = {
  NOT_CONFIGURED: { icon: KeyRound, title: "Market data is not set up yet", tone: "warn" },
  AUTH_FAILED: { icon: KeyRound, title: "The data source rejected the sign-in", tone: "down" },
  PROVIDER_UNREACHABLE: { icon: CloudOff, title: "The data source cannot be reached", tone: "warn" },
  PROVIDER_ERROR: { icon: ServerCrash, title: "The data source returned an error", tone: "down" },
  RATE_LIMITED: { icon: Timer, title: "Too many requests", tone: "warn" },
  NOT_FOUND: { icon: SearchX, title: "Not available", tone: "neutral" },
  BAD_REQUEST: { icon: SearchX, title: "That request is not valid", tone: "neutral" },
  UNAUTHENTICATED: { icon: KeyRound, title: "Sign in needed", tone: "info" },
  INTERNAL: { icon: ServerCrash, title: "Something went wrong", tone: "down" },
};

/** An honest failure state: what happened, what is missing (names only) and what to do next. No placeholder numbers. */
export function ErrorPanel({ error, onRetry, compact, className }: { error: ApiError; onRetry?: () => void; compact?: boolean; className?: string }) {
  const look = LOOK[error.code] ?? LOOK.INTERNAL;
  const setup = error.code === "NOT_CONFIGURED" || error.code === "AUTH_FAILED";
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-3 text-center", compact ? "px-4 py-8" : "px-6 py-12", className)}>
      <IconTile icon={look.icon} tone={look.tone} size={compact ? "lg" : "xl"} />
      <div className="max-w-md">
        <p className="font-semibold tracking-tight">{look.title}</p>
        <p className="mt-1 text-[13px] leading-5 text-muted">{error.message}</p>
        {error.missing?.length ? (
          <p className="mt-2 text-[13px] leading-6 text-muted">
            Missing settings:{" "}
            {error.missing.map((m) => (
              <code key={m} className="num mx-0.5 rounded-md border bg-surface-2 px-1.5 py-0.5 text-xs text-foreground [overflow-wrap:anywhere]">{m}</code>
            ))}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry ? (
          <Button size="sm" onClick={onRetry}>
            <RefreshCw /> Try again
          </Button>
        ) : null}
        {setup ? (
          <Button size="sm" variant="primary" asChild>
            <Link href="/settings#data">Open data settings</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action, tone = "brand", className }: { icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <IconTile icon={icon} tone={tone} size="xl" />
      <div className="max-w-sm">
        <p className="font-semibold tracking-tight">{title}</p>
        {children ? <div className="mt-1 text-[13px] leading-5 text-muted">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function RowsSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
