import type { Metadata } from "next";
import { SimulatorPage } from "@/components/simulator/simulator-page";

export const metadata: Metadata = { title: "Tradyn Simulator" };

export default function Page() {
  return <SimulatorPage />;
}
