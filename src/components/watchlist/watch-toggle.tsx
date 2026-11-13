"use client";
import { Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useWatchlists } from "@/hooks/use-watchlists";
import { cn } from "@/lib/utils/cn";
import type { WatchlistItem } from "@/types/market";

/** Star button: adds the share to a watchlist or removes it. With several watchlists it asks which one. */
export function WatchToggle({ item, withLabel, className }: { item: WatchlistItem; withLabel?: boolean; className?: string }) {
  const wl = useWatchlists();
  const inAny = wl.has(item.key);
  const label = inAny ? `Remove ${item.symbol} from watchlist` : `Add ${item.symbol} to watchlist`;
  const star = <Star className={cn(inAny && "fill-warn text-warn")} />;

  if (wl.lists.length <= 1) {
    const list = wl.lists[0];
    const toggle = async () => {
      if (!list) {
        if (await wl.create("My watchlist")) return; // the new list appears on the next render; the user taps again to add
        return;
      }
      if (list.items.some((i) => i.key === item.key)) await wl.removeItem(list.id, item.key);
      else await wl.add(list.id, item);
    };
    return (
      <Button variant={withLabel ? "secondary" : "ghost"} size={withLabel ? "md" : "icon-sm"} aria-label={label} aria-pressed={inAny} title={label} disabled={wl.busy || wl.loading} onClick={toggle} className={className}>
        {star}
        {withLabel ? (inAny ? "In watchlist" : list ? "Add to watchlist" : "Create a watchlist") : null}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={withLabel ? "secondary" : "ghost"} size={withLabel ? "md" : "icon-sm"} aria-label={`Watchlists for ${item.symbol}`} title="Add to a watchlist" disabled={wl.busy} className={className}>
          {star}
          {withLabel ? (inAny ? "In watchlist" : "Add to watchlist") : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{item.symbol} in…</DropdownMenuLabel>
        {wl.lists.map((l) => {
          const inside = l.items.some((i) => i.key === item.key);
          return (
            <DropdownMenuItem key={l.id} onSelect={() => (inside ? wl.removeItem(l.id, item.key) : wl.add(l.id, item))}>
              <span className="grid size-4 place-items-center">{inside ? <Check className="!text-brand" /> : null}</span>
              <span className="truncate">{l.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
