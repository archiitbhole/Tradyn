"use client";
import { Cloud, Loader2, MoreHorizontal, Pencil, Plus, Smartphone, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AuthDialog } from "@/components/layout/auth-dialog";
import { Delta } from "@/components/shared/delta";
import { PageHeader } from "@/components/shared/page-header";
import { FallbackNotice, FreshnessBadge, SourceLine } from "@/components/shared/source";
import { EmptyState, ErrorPanel, RowsSkeleton } from "@/components/shared/states";
import { StockSearch } from "@/components/shared/stock-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input, Label } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { useRefreshMs, useSession } from "@/hooks/use-market";
import { useWatchlists } from "@/hooks/use-watchlists";
import { cn } from "@/lib/utils/cn";
import { fmtPrice, fmtVolume, keyToPath } from "@/lib/utils/format";
import type { Quote, Watchlist } from "@/types/market";

function NameDialog({ open, onOpenChange, title, initial, action, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; initial: string; action: string; onSubmit: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={title} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || busy) return;
            setBusy(true);
            const ok = await onSubmit(name);
            setBusy(false);
            if (ok) onOpenChange(false);
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="wl-name">Name</Label>
            <Input id="wl-name" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Banks, Long term" />
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button>Cancel</Button></DialogClose>
            <Button type="submit" variant="primary" disabled={!name.trim() || busy}>{busy ? <Loader2 className="animate-spin" /> : null}{action}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ListBody({ list, onRemove, busy }: { list: Watchlist; onRemove: (key: string) => void; busy: boolean }) {
  const refresh = useRefreshMs("quotes");
  const keys = list.items.map((i) => i.key);
  const url = keys.length ? `/api/stocks/quotes?symbols=${encodeURIComponent(keys.slice(0, 60).join(","))}` : null;
  const { data, meta, error, reload } = useApi<{ quotes: Quote[]; missing: string[] }>(url, { refreshMs: refresh });
  const byKey = useMemo(() => new Map(data?.quotes.map((q) => [q.key, q])), [data]);

  if (!list.items.length) {
    return (
      <EmptyState icon={Star} title={`“${list.name}” is empty`}>
        Use the search box above to add shares or indices. You can also tap the star on any share in <Link href="/markets" className="font-medium text-foreground underline underline-offset-2">Markets</Link>.
      </EmptyState>
    );
  }
  return (
    <>
      <FallbackNotice meta={meta} className="mx-4 mt-4" />
      {error && !data ? <ErrorPanel error={error} onRetry={reload} compact /> : null}
      <ul className="divide-y">
        {list.items.map((it) => {
          const q = byKey.get(it.key);
          return (
            <li key={it.key} className="group flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-surface-2/60 sm:px-5">
              <Link href={keyToPath(it.key)} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium group-hover:text-brand">{it.symbol}</span>
                    <Badge className="hidden sm:inline-flex">{it.exchange}</Badge>
                  </span>
                  <span className="block truncate text-xs text-muted">{it.name}</span>
                </span>
                <span className="text-right">
                  <span className="num block font-medium">{q ? fmtPrice(q.price) : data || error ? "—" : "…"}</span>
                  <span className="sm:hidden">{q ? <Delta pct={q.changePct} showChange={false} className="text-xs" /> : null}</span>
                </span>
                <span className="hidden text-right sm:block">{q ? <Delta change={q.change} pct={q.changePct} className="text-[13px]" /> : <span className="text-xs text-faint">{data ? "No price from this source" : ""}</span>}</span>
                <span className="hidden items-center justify-end gap-2 text-right sm:flex">
                  <span className="num text-xs text-muted">{q?.volume != null ? `Vol ${fmtVolume(q.volume)}` : ""}</span>
                  {q ? <FreshnessBadge freshness={q.freshness} /> : null}
                </span>
              </Link>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${it.symbol} from ${list.name}`} title="Remove" disabled={busy} onClick={() => onRemove(it.key)}>
                <X />
              </Button>
            </li>
          );
        })}
      </ul>
      <SourceLine meta={meta} className="border-t px-4 py-3 sm:px-5" />
    </>
  );
}

export function WatchlistPage() {
  const wl = useWatchlists();
  const { session } = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "create" | "rename" | "delete">(null);
  const [auth, setAuth] = useState(false);
  // a watchlist that was just created opens straight away (its id is only known once it exists)
  const [createdFrom, setCreatedFrom] = useState<Set<string> | null>(null);
  const created = createdFrom ? wl.lists.find((l) => !createdFrom.has(l.id)) : undefined;
  const choose = (id: string | null) => {
    setSelected(id);
    setCreatedFrom(null);
  };
  const current = created ?? wl.lists.find((l) => l.id === selected) ?? wl.lists[0];
  const taken = useMemo(() => new Set(current?.items.map((i) => i.key)), [current]);

  return (
    <>
      <PageHeader
        icon={Star}
        title="Watchlist"
        description={wl.mode === "account" ? "Saved to your account — the same on every device." : "Saved in this browser on this device."}
        actions={
          <>
            <Badge tone={wl.mode === "account" ? "up" : "neutral"}>{wl.mode === "account" ? <Cloud /> : <Smartphone />}{wl.mode === "account" ? "Account" : "This device"}</Badge>
            <Button variant="primary" onClick={() => setDialog("create")}><Plus /> New watchlist</Button>
          </>
        }
      />

      {wl.mode === "device" && session ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface px-4 py-3 text-[13px] leading-5">
          <p className="text-muted">
            {session.accountsEnabled
              ? "Sign in to keep your watchlists in your account and see them on every device."
              : "Accounts are not set up on this deployment, so watchlists stay on this device. They are lost if you clear this browser's data."}
          </p>
          {session.accountsEnabled ? <Button size="sm" onClick={() => setAuth(true)}>Sign in</Button> : <Button size="sm" asChild><Link href="/settings#account">How to enable accounts</Link></Button>}
        </div>
      ) : null}

      {wl.error ? (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-down/35 bg-down-soft px-4 py-2.5 text-[13px] text-down">
          {wl.error}
          <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={wl.clearError}><X /></Button>
        </div>
      ) : null}

      {wl.loading ? (
        <Card><CardContent className="pt-5"><RowsSkeleton rows={6} /></CardContent></Card>
      ) : !current ? (
        <Card>
          <EmptyState icon={Star} title="No watchlists yet" action={<Button variant="primary" onClick={() => setDialog("create")}><Plus /> Create a watchlist</Button>}>
            A watchlist is a list of shares you follow. Create one, then add shares to track their prices and day changes.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b p-3 sm:p-4">
            <div className="scroll-thin flex max-w-full items-center gap-1.5 overflow-x-auto" role="tablist" aria-label="Watchlists">
              {wl.lists.map((l) => (
                <button
                  key={l.id}
                  role="tab"
                  type="button"
                  aria-selected={l.id === current.id}
                  onClick={() => choose(l.id)}
                  className={cn("inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium transition-colors", l.id === current.id ? "border-brand/40 bg-brand-soft text-foreground" : "border-transparent text-muted hover:bg-surface-2 hover:text-foreground")}
                >
                  {l.name}
                  <span className="num text-xs text-faint">{l.items.length}</span>
                </button>
              ))}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Options for ${current.name}`} className="ml-auto"><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog("rename")}><Pencil /> Rename</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog("delete")} className="text-down [&_svg]:text-down"><Trash2 /> Delete watchlist</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="border-b p-3 sm:p-4">
            <StockSearch keepOpen taken={taken} placeholder={`Add a share to “${current.name}”`} onPick={(ins) => wl.add(current.id, { key: ins.key, symbol: ins.symbol, name: ins.name, exchange: ins.exchange, kind: ins.kind })} />
          </div>
          <ListBody key={current.id} list={current} busy={wl.busy} onRemove={(key) => wl.removeItem(current.id, key)} />
        </Card>
      )}

      {dialog === "create" ? <NameDialog open onOpenChange={(v) => !v && setDialog(null)} title="New watchlist" initial="" action="Create" onSubmit={async (n) => { const before = new Set(wl.lists.map((l) => l.id)); const ok = await wl.create(n); if (ok) setCreatedFrom(before); return ok; }} /> : null}
      {dialog === "rename" && current ? <NameDialog open onOpenChange={(v) => !v && setDialog(null)} title="Rename watchlist" initial={current.name} action="Save" onSubmit={(n) => wl.rename(current.id, n)} /> : null}
      {dialog === "delete" && current ? (
        <Dialog open onOpenChange={(v) => !v && setDialog(null)}>
          <DialogContent>
            <DialogHeader title={`Delete “${current.name}”?`} description={`This removes the watchlist and its ${current.items.length} share${current.items.length === 1 ? "" : "s"}. It cannot be undone.`} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button>Cancel</Button></DialogClose>
              <Button variant="danger" disabled={wl.busy} onClick={async () => { if (await wl.remove(current.id)) { choose(null); setDialog(null); } }}><Trash2 /> Delete</Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      <AuthDialog open={auth} onOpenChange={setAuth} />
    </>
  );
}
