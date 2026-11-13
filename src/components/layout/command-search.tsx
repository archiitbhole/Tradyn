"use client";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StockSearch } from "@/components/shared/stock-search";
import { keyToPath } from "@/lib/utils/format";

/** Search from anywhere: click the box in the top bar, or press / or Ctrl/⌘ + K. */
export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-9 w-full max-w-md items-center gap-2.5 rounded-[10px] border border-border-strong bg-surface px-3 text-left text-sm text-faint transition-colors hover:border-faint hover:text-muted"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Search shares and indices</span>
        <kbd className="num hidden rounded-md border bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted sm:inline">/</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="top" className="overflow-visible p-3">
          <DialogTitle className="sr-only">Search shares and indices</DialogTitle>
          <DialogDescription className="sr-only">Type a company name or symbol, then choose a result to open its page.</DialogDescription>
          <StockSearch
            autoFocus
            onPick={(ins) => {
              setOpen(false);
              router.push(keyToPath(ins.key));
            }}
          />
          <p className="px-1 pt-2.5 text-xs text-faint">↑ ↓ to move · Enter to open · Esc to close</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
