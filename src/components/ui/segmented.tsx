"use client";
import { cn } from "@/lib/utils/cn";

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string; disabled?: boolean; title?: string }[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}

/** A row of mutually exclusive choices (exchange, chart range, speed…). */
export function Segmented<T extends string>({ value, onChange, options, label, size = "md", className }: Props<T>) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center gap-0.5 rounded-[10px] border bg-surface-2 p-[3px]", size === "sm" ? "h-8" : "h-9", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full rounded-[7px] px-2.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-40",
            o.value === value && "bg-surface text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.14)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
