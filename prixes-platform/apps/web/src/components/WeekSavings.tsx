"use client";

/**
 * « Cette semaine, Prixes vous a fait économiser 12,40 € »: what comparing the
 * shops saved on the shops done since Monday, plus what the cupboard kept from
 * being bought twice. Shown once there is something to show.
 */

import { useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { eur } from "@/lib/format";
import { useApp } from "@/lib/store";

export function WeekSavings() {
  const { user } = useApp();
  const { data: month } = useQuery({
    queryKey: ["budget"],
    queryFn: () => api.getBudget(),
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });
  const shops = Number(month?.week_saved ?? 0);
  const cupboard = Number(month?.week_pantry ?? 0);
  const total = shops + cupboard;
  if (!user || total <= 0) return null;

  return (
    <section
      aria-labelledby="t-week"
      className="prixes-rise mb-5 flex items-center gap-4 rounded-2xl bg-tertiary-container p-4 text-on-tertiary-container"
    >
      <Icon name="savings" fill className="text-[36px]" />
      <div className="min-w-0">
        <h2 id="t-week" className="text-label-lg">
          Cette semaine, Prixes vous a fait économiser
        </h2>
        <p className="font-display text-[28px] font-extrabold leading-tight tabular-nums">{eur(total)}</p>
        <p className="text-body-md opacity-90">
          {[
            shops > 0 ? `${eur(shops)} en choisissant le magasin` : null,
            cupboard > 0 ? `${eur(cupboard)} grâce à votre placard` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </section>
  );
}
