import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/*
 * Tradyn's own artwork only: the "T" emblem and the hand-drawn TRADYN wordmark, as uploaded in
 * brand-source/. scripts/build-brand.py makes these display-size files from the originals
 * (transparent background, light-background variant, linear-light resampling); they are served
 * as-is (`unoptimized`) so the browser shows exactly those pixels.
 */
const MARK = { src: "/brand/tradyn-mark-ui.png", w: 121, h: 96 };
const WORD = { dark: "/brand/tradyn-wordmark-ui.png", light: "/brand/tradyn-wordmark-light-ui.png", w: 242, h: 108 };
const FULL = { dark: "/brand/tradyn-logo-ui.png", light: "/brand/tradyn-logo-light-ui.png", w: 489, h: 400 };

/** Share of the tile's height the emblem fills; leaves clear space inside the rounded corners. */
const MARK_FILL = 0.66;

/** The "T" emblem on its own dark tile — the same presentation as the app and browser icons, on every theme. */
export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  const h = Math.round(size * MARK_FILL);
  return (
    <span className={cn("brand-tile", className)} style={{ width: size, height: size }}>
      <Image src={MARK.src} alt="" width={Math.round((h * MARK.w) / MARK.h)} height={h} priority unoptimized draggable={false} />
    </span>
  );
}

/** The hand-drawn TRADYN wordmark: white lettering on dark, ink lettering on light — same artwork. */
export function Wordmark({ height = 26, className }: { height?: number; className?: string }) {
  const w = Math.round((height * WORD.w) / WORD.h);
  return (
    <span className={cn("brand-word inline-flex", className)}>
      <Image src={WORD.dark} alt="Tradyn" width={w} height={height} priority unoptimized draggable={false} className="hidden dark:block" />
      <Image src={WORD.light} alt="Tradyn" width={w} height={height} priority unoptimized draggable={false} className="block dark:hidden" />
    </span>
  );
}

/** The complete emblem (T, chart and TRADYN lettering), for the About panel. */
export function FullLogo({ height = 150, className }: { height?: number; className?: string }) {
  const w = Math.round((height * FULL.w) / FULL.h);
  return (
    <span className={cn("brand-full inline-flex", className)}>
      <Image src={FULL.dark} alt="Tradyn" width={w} height={height} unoptimized draggable={false} className="hidden dark:block" />
      <Image src={FULL.light} alt="Tradyn" width={w} height={height} unoptimized draggable={false} className="block dark:hidden" />
    </span>
  );
}
