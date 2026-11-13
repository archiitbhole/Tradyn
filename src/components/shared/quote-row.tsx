import Link from "next/link";
import { Delta } from "@/components/shared/delta";
import { fmtPrice, fmtVolume, keyToPath } from "@/lib/utils/format";
import type { Quote } from "@/types/market";

/** One line in a ranked list: symbol and name on the left, price and day change on the right. */
export function QuoteRow({ quote, extra, rank }: { quote: Quote; extra?: "volume" | "value"; rank?: number }) {
  return (
    <li>
      <Link href={keyToPath(quote.key)} className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
        {rank ? <span className="num w-4 shrink-0 text-center text-xs text-faint">{rank}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium group-hover:text-brand">{quote.symbol}</span>
          <span className="block truncate text-xs text-muted">
            {extra === "volume" ? `${fmtVolume(quote.volume)} shares` : extra === "value" && quote.volume != null ? `≈ ₹${fmtVolume(quote.price * quote.volume)} traded` : quote.name}
          </span>
        </span>
        <span className="text-right">
          <span className="num block text-sm font-medium">{fmtPrice(quote.price)}</span>
          <Delta pct={quote.changePct} showChange={false} className="text-xs" />
        </span>
      </Link>
    </li>
  );
}
