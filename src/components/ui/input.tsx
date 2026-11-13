import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-[10px] border border-border-strong bg-surface px-3 text-sm text-foreground placeholder:text-faint transition-[border-color,box-shadow] hover:border-faint focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]/30 disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-muted", className)} {...props} />;
}
