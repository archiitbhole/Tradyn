import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketsTable } from "@/components/markets/markets-table";

export const metadata: Metadata = { title: "Markets" };

export default function Page() {
  return (
    <Suspense>
      <MarketsTable />
    </Suspense>
  );
}
