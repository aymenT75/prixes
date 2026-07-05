"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { DealCard } from "@/components/DealCard";
import { Fab } from "@/components/Fab";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";

// Only surface what the bottom tab bar does NOT already cover — Courses, Scanner,
// Carburant and Deals are permanent tabs, so putting them here too is redundant.
// These two personal tools have no tab, so this is their quick access.
const SHORTCUTS = [
  { href: "/list", label: "Ma liste", icon: "list_alt", box: "bg-primary/10 text-primary" },
  { href: "/alerts", label: "Alertes", icon: "notifications_active", box: "bg-secondary/10 text-secondary" },
];

export default function HomePage() {
  const { data } = useQuery({ queryKey: ["deals", "hot"], queryFn: () => api.listDeals("hot") });
  const top = data?.items.slice(0, 4) ?? [];

  return (
    <div>
      <PageHeader title="Prixes" />

      <section className="relative mb-6 overflow-hidden rounded-xl bg-primary-container p-6 text-on-primary-container shadow-card">
        <div className="absolute -right-4 -bottom-6 opacity-10">
          <Icon name="savings" className="text-[120px]" />
        </div>
        <div className="relative z-10">
          <h2 className="text-headline-lg">Économisez sur tout 💚</h2>
          <p className="mt-1 max-w-xs text-body-md opacity-90">
            Comparez les prix des courses et carburants, partagez les meilleures offres.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-headline-md text-on-surface">
          <Icon name="apps" className="text-primary" /> Mes outils
        </h2>
        <div className="grid grid-cols-2 gap-gutter">
          {SHORTCUTS.map((s) => (
            <Link key={s.href} href={s.href} className="card flex items-center gap-3 p-4 active:scale-95">
              <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${s.box}`}>
                <Icon name={s.icon} fill className="text-[22px]" />
              </span>
              <span className="text-label-lg text-on-surface">{s.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-headline-md text-on-surface">
            <Icon name="local_fire_department" fill className="text-deal-accent" /> Deals populaires
          </h2>
          <Link href="/deals" className="text-label-lg text-primary">
            Tout voir
          </Link>
        </div>
        <div className="space-y-4">
          {top.length === 0 && (
            <div className="card flex flex-col items-center gap-2 p-8 text-center text-on-surface-variant">
              <Icon name="inbox" className="text-[32px] text-outline-variant" />
              <p className="text-body-md">Aucun deal pour l&apos;instant.</p>
            </div>
          )}
          {top.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      </section>

      <Fab />
    </div>
  );
}
