import { Activity, CandlestickChart, Compass, FlaskConical, LayoutDashboard, LineChart, type LucideIcon, Settings, Star } from "lucide-react";
import type { Tone } from "@/components/ui/icon-tile";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  tone: Tone;
  /** Extra path prefixes that belong to this item. */
  match?: string[];
}

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", short: "Overview", icon: LayoutDashboard, tone: "brand" },
  { href: "/markets", label: "Markets", short: "Markets", icon: CandlestickChart, tone: "brand" },
  { href: "/watchlist", label: "Watchlist", short: "Watchlist", icon: Star, tone: "brand" },
  { href: "/explorer", label: "Stock Explorer", short: "Explorer", icon: Compass, tone: "brand" },
  { href: "/stocks", label: "Stock Details", short: "Details", icon: LineChart, tone: "brand" },
  { href: "/insights", label: "Market Insights", short: "Insights", icon: Activity, tone: "brand" },
  { href: "/simulator", label: "Tradyn Simulator", short: "Simulator", icon: FlaskConical, tone: "sim" },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, tone: "neutral" },
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
