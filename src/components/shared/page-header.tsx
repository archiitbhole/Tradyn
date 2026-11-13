import type { LucideIcon } from "lucide-react";
import { IconTile, type Tone } from "@/components/ui/icon-tile";

export function PageHeader({ icon, title, description, actions, tone = "brand" }: { icon: LucideIcon; title: string; description?: React.ReactNode; actions?: React.ReactNode; tone?: Tone }) {
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        <IconTile icon={icon} tone={tone} size="lg" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-[22px]">{title}</h1>
          {description ? <p className="mt-0.5 text-[13px] leading-5 text-muted">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
