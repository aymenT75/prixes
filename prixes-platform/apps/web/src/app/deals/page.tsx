"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { DealCard } from "@/components/DealCard";
import { Fab } from "@/components/Fab";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";

export default function DealsPage() {
  const [sort, setSort] = useState<"hot" | "new">("hot");
  const { data, isLoading, error } = useQuery({
    queryKey: ["deals", sort],
    queryFn: () => api.listDeals(sort),
  });

  return (
    <div>
      <PageHeader title="Deals" />

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {([
          ["hot", "Populaires", "local_fire_department"],
          ["new", "Nouveaux", "schedule"],
        ] as const).map(([s, label, icon]) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`chip flex items-center gap-1.5 ${sort === s ? "chip-active" : "chip-idle"}`}
          >
            <Icon name={icon} className="text-[16px]" /> {label}
          </button>
        ))}
      </div>

      {isLoading && <p className="py-10 text-center text-on-surface-variant">Chargement…</p>}
      {error && <p className="py-10 text-center text-error">Impossible de charger les deals.</p>}
      {data?.items.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-on-surface-variant">
          <Icon name="sell" className="text-[36px] text-outline-variant" />
          <p className="text-body-md">Aucun deal pour l&apos;instant.</p>
          <p className="text-micro">Soyez le premier à en partager un !</p>
        </div>
      )}

      <div className="space-y-4">
        {data?.items.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>

      <Fab />
    </div>
  );
}
