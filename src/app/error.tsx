"use client";
import { ServerCrash } from "lucide-react";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState icon={ServerCrash} tone="down" title="This page hit a problem" action={<Button variant="primary" onClick={reset}>Try again</Button>}>
      Nothing was lost. Try again, or use the menu to open another section.
    </EmptyState>
  );
}
