"use client";
import { Loader2, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useApi } from "@/hooks/use-api";
import { cn } from "@/lib/utils/cn";
import type { Instrument } from "@/types/market";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface Props {
  onPick: (ins: Instrument) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Keys already chosen: shown as "Added" and not pickable. */
  taken?: Set<string>;
  className?: string;
  /** Keep the text and the list after a pick (for adding several shares in a row). */
  keepOpen?: boolean;
}

/** Search shares and indices by symbol or company name. Fully keyboard-operable (↑ ↓ Enter Esc). */
export function StockSearch({ onPick, placeholder = "Search a share or index — e.g. Reliance, TCS, Nifty", autoFocus, taken, className, keepOpen }: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(text.trim(), 160);
  const { data, loading, error } = useApi<Instrument[]>(q ? `/api/stocks/search?q=${encodeURIComponent(q)}&limit=10` : null);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const results = q ? (data ?? []) : [];

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const pick = (ins: Instrument) => {
    if (taken?.has(ins.key)) return;
    onPick(ins);
    if (!keepOpen) {
      setText("");
      setOpen(false);
    }
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
      <input
        role="combobox"
        aria-expanded={open && !!q}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search shares and indices"
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape" && open && text) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="h-11 w-full rounded-xl border border-border-strong bg-surface pl-9 pr-9 text-sm placeholder:text-faint transition-[border-color,box-shadow] hover:border-faint focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]/30"
      />
      {loading && q ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-faint" aria-hidden /> : null}
      {open && q ? (
        <ul id={listId} role="listbox" aria-label="Search results" className="scroll-thin absolute inset-x-0 top-[calc(100%+6px)] z-40 max-h-[340px] overflow-y-auto rounded-xl border bg-surface p-1.5 shadow-pop">
          {results.map((r, i) => {
            const used = taken?.has(r.key);
            return (
              <li key={r.key} role="option" aria-selected={i === active} aria-disabled={used}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r)}
                  disabled={used}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-55", i === active && "bg-surface-2")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.symbol}</span>
                    <span className="block truncate text-xs text-muted">{r.name}</span>
                  </span>
                  {used ? <Badge tone="brand">Added</Badge> : null}
                  {r.kind === "INDEX" ? <Badge tone="info">Index</Badge> : null}
                  <Badge>{r.exchange}</Badge>
                </button>
              </li>
            );
          })}
          {!results.length && !loading ? (
            <li className="px-3 py-6 text-center text-[13px] text-muted">{error ? error.message : `No share or index matches “${q}”. Try the NSE symbol, e.g. INFY.`}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
