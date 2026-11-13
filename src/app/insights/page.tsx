import type { Metadata } from "next";
import { InsightsPage } from "@/components/insights/insights-page";

export const metadata: Metadata = { title: "Market Insights" };

export default function Page() {
  return <InsightsPage />;
}
