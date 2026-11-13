"use client";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark, Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { IconTile } from "@/components/ui/icon-tile";
import { Tip } from "@/components/ui/tooltip";
import { usePref } from "@/hooks/use-pref";
import { cn } from "@/lib/utils/cn";
import { AccountMenu } from "./account-menu";
import { CommandSearch } from "./command-search";
import { NAV, isActive, type NavItem } from "./nav";
import { StatusPill } from "./status-pill";
import { ThemeToggle } from "./theme-toggle";

const QUICK = [NAV[0], NAV[1], NAV[2], NAV[5]];

function NavLink({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed?: boolean; onNavigate?: () => void }) {
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/tile relative flex items-center gap-3 rounded-xl text-sm font-medium transition-colors",
        collapsed ? "justify-center p-1.5" : "px-2 py-1.5",
        active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2/70 hover:text-foreground",
      )}
    >
      {active && !collapsed ? <span className={cn("absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full", item.tone === "sim" ? "bg-sim" : "bg-brand")} aria-hidden /> : null}
      <IconTile icon={item.icon} tone={active ? (item.tone === "neutral" ? "brand" : item.tone) : item.tone === "sim" ? "sim" : "neutral"} active={active} size="sm" />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </Link>
  );
  return collapsed ? <Tip label={item.label} side="right">{link}</Tip> : link;
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/" aria-label="Tradyn — Overview" className="flex items-center gap-3 rounded-xl">
      <BrandMark size={40} />
      {collapsed ? null : <Wordmark height={34} className="-mt-1" />}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = usePref<boolean>("tradyn.sidebar.collapsed", false);
  const [drawer, setDrawer] = useState(false);
  const main = NAV.slice(0, 6);
  const rest = NAV.slice(6);
  // "More" is highlighted on sections that have no button of their own in the bottom bar
  const moreActive = !QUICK.some((item) => isActive(item, pathname));

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-surface/80 backdrop-blur-xl transition-[width] duration-200 lg:flex", collapsed ? "w-[68px]" : "w-[244px]")}>
        <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "px-4")}>
          <Brand collapsed={collapsed} />
        </div>
        <nav aria-label="Main" className={cn("scroll-thin flex-1 space-y-1 overflow-y-auto py-2", collapsed ? "px-2.5" : "px-3")}>
          {main.map((item) => <NavLink key={item.href} item={item} active={isActive(item, pathname)} collapsed={collapsed} />)}
          <div className="!my-3 h-px bg-border" role="separator" />
          {rest.map((item) => <NavLink key={item.href} item={item} active={isActive(item, pathname)} collapsed={collapsed} />)}
        </nav>
        <div className={cn("border-t p-2.5", collapsed && "flex justify-center")}>
          <Button variant="ghost" size={collapsed ? "icon" : "sm"} className={cn(!collapsed && "w-full justify-start")} onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen /> : <><PanelLeftClose /> Collapse</>}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-xl sm:gap-3 sm:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <Link href="/" aria-label="Tradyn — Overview" className="lg:hidden">
            <BrandMark size={34} />
          </Link>
          <div className="min-w-0 flex-1">
            <CommandSearch />
          </div>
          <StatusPill className="hidden md:inline-flex" />
          <ThemeToggle />
          <AccountMenu />
        </header>

        <main id="main" className="mx-auto w-full max-w-[1480px] flex-1 px-3 pb-24 pt-5 sm:px-5 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile: bottom bar with the four most-used sections, everything else in the menu */}
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {QUICK.map((item) => {
          const active = isActive(item, pathname);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors", active ? "text-brand" : "text-muted hover:text-foreground")}>
              <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-brand-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand)_28%,transparent)]")}>
                <item.icon className="size-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
              </span>
              {item.short}
            </Link>
          );
        })}
        <button type="button" onClick={() => setDrawer(true)} className={cn("flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors", moreActive ? "text-brand" : "text-muted hover:text-foreground")}>
          <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", moreActive && "bg-brand-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand)_28%,transparent)]")}>
            <Menu className="size-5" strokeWidth={moreActive ? 2.2 : 1.8} aria-hidden />
          </span>
          More
        </button>
      </nav>

      <Dialog open={drawer} onOpenChange={setDrawer}>
        <DialogContent side="left" className="p-4">
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <DialogDescription className="sr-only">All sections of Tradyn</DialogDescription>
          <div className="mb-4 flex items-center justify-between">
            <Brand />
          </div>
          <StatusPill className="mb-3 md:hidden" />
          <nav aria-label="All sections" className="space-y-1 pl-3">
            {NAV.map((item) => <NavLink key={item.href} item={item} active={isActive(item, pathname)} onNavigate={() => setDrawer(false)} />)}
          </nav>
        </DialogContent>
      </Dialog>
    </div>
  );
}
