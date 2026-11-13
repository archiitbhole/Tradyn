"use client";
import { Compass } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState icon={Compass} title="This page does not exist" action={<Button variant="primary" asChild><Link href="/">Go to Overview</Link></Button>}>
      The address may be mistyped, or the share is not listed on NSE or BSE.
    </EmptyState>
  );
}
