import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockDetail } from "@/components/stocks/stock-detail";
import { getInstrument, keyOf } from "@/lib/market-data/universe";

interface Props {
  params: Promise<{ key: string }>;
}

function find(raw: string) {
  let key = raw;
  try {
    key = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  return getInstrument(key.toUpperCase());
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ins = find((await params).key);
  return { title: ins ? `${ins.symbol} · ${ins.name}` : "Not found" };
}

export default async function Page({ params }: Props) {
  const ins = find((await params).key);
  if (!ins) notFound();
  // the same company on the other exchange, when it is listed there under the same symbol
  const twin = ins.kind === "EQ" ? (getInstrument(keyOf(ins.exchange === "NSE" ? "BSE" : "NSE", ins.symbol)) ?? null) : null;
  return <StockDetail key={ins.key} instrument={ins} twin={twin} />;
}
