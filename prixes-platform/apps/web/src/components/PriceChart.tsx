"use client";

import { eur } from "@/lib/format";
import type { PriceHistoryPoint } from "@/lib/types";

// Compact responsive line chart of daily lowest price. Pure SVG, themed via
// currentColor (text-primary) so it follows light/dark/contrast automatically.
export function PriceChart({
  points,
  lowest,
  highest,
}: {
  points: PriceHistoryPoint[];
  lowest: number | null;
  highest: number | null;
}) {
  if (points.length < 2 || lowest == null || highest == null) return null;

  const W = 300;
  const H = 96;
  const PAD = 6;
  const span = Math.max(highest - lowest, 0.01);
  const n = points.length;

  const x = (i: number) => PAD + (i / (n - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - lowest) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${x(i)},${y(p.price)}`).join(" ");
  const area = `${x(0)},${H - PAD} ${line} ${x(n - 1)},${H - PAD}`;

  const minIdx = points.reduce((m, p, i) => (p.price < points[m].price ? i : m), 0);
  const last = points[n - 1];

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });

  return (
    <div className="text-primary">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <p className="text-micro uppercase tracking-wider text-on-surface-variant">
            Prix le plus bas
          </p>
          <p className="text-headline-md text-primary">{eur(lowest)}</p>
        </div>
        <div className="text-right">
          <p className="text-micro uppercase tracking-wider text-on-surface-variant">Dernier</p>
          <p className="text-label-lg text-on-surface">{eur(last.price)}</p>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Historique des prix">
        <polygon points={area} fill="currentColor" opacity={0.08} />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={x(minIdx)} cy={y(points[minIdx].price)} r={3.5} fill="currentColor" />
      </svg>

      <div className="mt-1 flex justify-between text-micro text-on-surface-variant">
        <span>{fmtDate(points[0].day)}</span>
        <span>{fmtDate(last.day)}</span>
      </div>
    </div>
  );
}
