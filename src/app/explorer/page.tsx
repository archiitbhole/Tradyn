import type { Metadata } from "next";
import { Explorer } from "@/components/stocks/explorer";

export const metadata: Metadata = { title: "Stock Explorer" };

export default function Page() {
  return <Explorer />;
}
