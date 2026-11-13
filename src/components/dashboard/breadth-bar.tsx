import type { Breadth } from "@/types/market";

/** Advances / unchanged / declines as one proportional bar with the counts written out. */
export function BreadthBar({ breadth }: { breadth: Breadth }) {
  const total = Math.max(1, breadth.advances + breadth.declines + breadth.unchanged);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${breadth.advances} advancing, ${breadth.unchanged} unchanged, ${breadth.declines} declining`}>
        <span className="bg-up" style={{ width: pct(breadth.advances) }} />
        <span className="bg-faint/50" style={{ width: pct(breadth.unchanged) }} />
        <span className="bg-down" style={{ width: pct(breadth.declines) }} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dd className="num text-lg font-semibold text-up">{breadth.advances}</dd>
          <dt className="text-xs text-muted">Advances</dt>
        </div>
        <div>
          <dd className="num text-lg font-semibold">{breadth.unchanged}</dd>
          <dt className="text-xs text-muted">Unchanged</dt>
        </div>
        <div>
          <dd className="num text-lg font-semibold text-down">{breadth.declines}</dd>
          <dt className="text-xs text-muted">Declines</dt>
        </div>
      </dl>
    </div>
  );
}
