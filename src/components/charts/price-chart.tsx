"use client";
import { AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineStyle, createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { fmtPrice, fmtVolume } from "@/lib/utils/format";
import type { Candle } from "@/types/market";

const IST_SEC = 19_800;

interface Hover {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function label(time: number, intraday: boolean): string {
  const d = new Date(time * 1000);
  return intraday
    ? d.toLocaleString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " IST"
    : d.toLocaleDateString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Price chart of real candles (TradingView Lightweight Charts). Candles or a line, with a volume
 * histogram when the source sends volume. Intraday times are shown in India time.
 */
export function PriceChart({ candles, intraday, mode, prevClose, height = 420 }: { candles: Candle[]; intraday: boolean; mode: "candles" | "line"; prevClose?: number | null; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [hover, setHover] = useState<Hover | null>(null);
  const last = candles[candles.length - 1];
  const shown = hover ?? (last ? { ...last, time: last.time + (intraday ? IST_SEC : 0) } : null);
  const hasVolume = candles.some((c) => c.volume != null && c.volume > 0);

  useEffect(() => {
    if (!el.current || !candles.length) return;
    const up = cssVar("--up");
    const down = cssVar("--down");
    const grid = cssVar("--border");
    const text = cssVar("--muted");
    const shift = intraday ? IST_SEC : 0;
    const chart: IChartApi = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text, fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 12, attributionLogo: true },
      grid: { vertLines: { color: grid, style: LineStyle.Dotted }, horzLines: { color: grid, style: LineStyle.Dotted } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: hasVolume ? 0.24 : 0.08 } },
      timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false, rightOffset: 2 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { labelBackgroundColor: cssVar("--surface-3") }, horzLine: { labelBackgroundColor: cssVar("--surface-3") } },
      localization: { locale: "en-IN", priceFormatter: (p: number) => fmtPrice(p) },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
    });
    const rising = last.close >= (prevClose ?? candles[0].open);
    const main =
      mode === "candles"
        ? chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: true })
        : chart.addSeries(AreaSeries, { lineColor: rising ? up : down, topColor: (rising ? up : down) + "44", bottomColor: (rising ? up : down) + "00", lineWidth: 2, priceLineVisible: true });
    if (mode === "candles") main.setData(candles.map((c) => ({ time: (c.time + shift) as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    else main.setData(candles.map((c) => ({ time: (c.time + shift) as UTCTimestamp, value: c.close })));
    if (prevClose != null && prevClose > 0 && intraday) {
      main.createPriceLine({ price: prevClose, color: cssVar("--faint"), lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "Prev close" });
    }
    if (hasVolume) {
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false });
      vol.setData(candles.map((c) => ({ time: (c.time + shift) as UTCTimestamp, value: c.volume ?? 0, color: (c.close >= c.open ? up : down) + "66" })));
    }
    const byTime = new Map(candles.map((c) => [c.time + shift, c]));
    chart.subscribeCrosshairMove((p) => {
      const c = typeof p.time === "number" ? byTime.get(p.time) : undefined;
      setHover(c ? { ...c, time: c.time + shift } : null);
    });
    chart.timeScale().fitContent();
    return () => {
      setHover(null);
      chart.remove();
    };
    // `last` and `hasVolume` are derived from `candles`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, intraday, mode, prevClose, resolvedTheme]);

  return (
    <div>
      <div className="num mb-2 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-live="off">
        {shown ? (
          <>
            <span className="font-sans text-foreground">{label(shown.time, intraday)}</span>
            <span>O <b className="font-medium text-foreground">{fmtPrice(shown.open)}</b></span>
            <span>H <b className="font-medium text-foreground">{fmtPrice(shown.high)}</b></span>
            <span>L <b className="font-medium text-foreground">{fmtPrice(shown.low)}</b></span>
            <span>C <b className={shown.close >= shown.open ? "font-medium text-up" : "font-medium text-down"}>{fmtPrice(shown.close)}</b></span>
            {shown.volume != null ? <span>Vol <b className="font-medium text-foreground">{fmtVolume(shown.volume)}</b></span> : null}
          </>
        ) : null}
      </div>
      <div ref={el} style={{ height }} role="img" aria-label={`Price chart with ${candles.length} candles`} />
    </div>
  );
}
