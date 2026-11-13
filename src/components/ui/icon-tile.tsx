import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type Tone = "neutral" | "brand" | "up" | "down" | "warn" | "info" | "sim";

const SIZES = { sm: "size-8 [&_svg]:size-4", md: "size-9 [&_svg]:size-[18px]", lg: "size-11 [&_svg]:size-5", xl: "size-14 rounded-2xl [&_svg]:size-6" } as const;

/**
 * The one container every icon in Tradyn sits in: same sizes, radius, border and soft tint,
 * with a gentle lift and glow when its parent (class `group/tile`) is hovered or it is active.
 */
export function IconTile({ icon: Icon, tone = "neutral", size = "md", active, className }: { icon: LucideIcon; tone?: Tone; size?: keyof typeof SIZES; active?: boolean; className?: string }) {
  return (
    <span className={cn("icon-tile", SIZES[size], className)} data-tone={tone} data-active={active ? "true" : undefined} aria-hidden>
      <Icon strokeWidth={1.9} />
    </span>
  );
}
