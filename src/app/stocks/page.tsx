import type { Metadata } from "next";
import { StocksHub } from "@/components/stocks/stocks-hub";

export const metadata: Metadata = { title: "Stock Details" };

export default function Page() {
  return <StocksHub />;
}
