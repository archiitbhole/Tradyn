import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

const badge = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5", {
  variants: {
    tone: {
      neutral: "border-border bg-surface-2 text-muted",
      brand: "border-brand/30 bg-brand-soft text-brand",
      up: "border-up/30 bg-up-soft text-up",
      down: "border-down/30 bg-down-soft text-down",
      warn: "border-warn/35 bg-warn-soft text-warn",
      info: "border-info/30 bg-info-soft text-info",
      sim: "border-sim/35 bg-sim-soft text-sim",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
