"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, side, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: "center" | "left" | "top" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 border bg-surface shadow-pop focus:outline-none",
          side === "left"
            ? "inset-y-0 left-0 w-[min(86vw,320px)] overflow-y-auto"
            : side === "top"
              ? "left-1/2 top-[10vh] w-[min(94vw,560px)] -translate-x-1/2 rounded-2xl"
              : "left-1/2 top-1/2 max-h-[88vh] w-[min(94vw,440px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-6",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <DialogPrimitive.Title className="text-base font-semibold tracking-tight">{title}</DialogPrimitive.Title>
        {description ? <DialogPrimitive.Description className="mt-1 text-[13px] leading-5 text-muted">{description}</DialogPrimitive.Description> : null}
      </div>
      <DialogPrimitive.Close aria-label="Close" className="-mr-1.5 -mt-1.5 grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
        <X className="size-4" />
      </DialogPrimitive.Close>
    </div>
  );
}

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
