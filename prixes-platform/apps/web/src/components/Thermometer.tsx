"use client";

import { Icon } from "@/components/Icon";
import { dealTemperature, temperatureColor } from "@/lib/format";

// The colour carries the "how good is this deal" signal at a glance, but
// never colour-only: an icon (snowflake → thermostat → flame) plus a spoken-
// out label ("Froid — peu intéressant" etc.) says the same thing in words.
export function Thermometer({ discountPct, compact = false }: { discountPct: number; compact?: boolean }) {
  const { temperature, label, icon } = dealTemperature(discountPct);
  const color = temperatureColor[temperature];

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-bold text-white"
        style={{ backgroundColor: color }}
        title={label}
      >
        <Icon name={icon} fill className="text-[13px]" />-{Math.round(discountPct)}%
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2" role="img" aria-label={`Thermomètre du deal : ${label}`}>
      <span
        className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: `${color}1f`, color }}
      >
        <Icon name={icon} fill className="text-[20px]" />
      </span>
      <div>
        <p className="text-label-md font-semibold" style={{ color }}>
          {label}
        </p>
        <p className="text-micro text-on-surface-variant">-{Math.round(discountPct)}% par rapport au prix le plus haut</p>
      </div>
    </div>
  );
}
