"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ProductCard } from "@/components/ProductCard";
import { api } from "@/lib/api";

// Only surface what the bottom tab bar does NOT already cover — Courses, Scanner,
// Carburant and Deals are permanent tabs, so putting them here too is redundant.
// These personal tools have no tab, so this is their quick access.
const SHORTCUTS = [
  { href: "/list", label: "Ma liste", icon: "list_alt", box: "bg-primary/10 text-primary" },
  { href: "/alerts", label: "Alertes", icon: "notifications_active", box: "bg-secondary/10 text-secondary" },
  { href: "/stores", label: "Magasins", icon: "store", box: "bg-tertiary/10 text-tertiary" },
  { href: "/feedback", label: "Mon avis", icon: "reviews", box: "bg-primary/10 text-primary" },
];

export default function HomePage() {
  // Popular products (not deals) so tapping a card opens the in-app product sheet
  // rather than leaving to an external merchant site.
  const { data } = useQuery({ queryKey: ["products", "browse"], queryFn: () => api.browseProducts() });
  const top = data?.items.slice(0, 6) ?? [];

  return (
    <div>
      <PageHeader title="Prixes" />

      <section className="relative mb-6 overflow-hidden rounded-xl bg-primary-container p-6 text-on-primary-container shadow-card">
        <div className="absolute -right-4 -bottom-6 opacity-10">
          <Icon name="savings" className="text-[120px]" />
        </div>
        <div className="relative z-10">
          <h2 className="text-headline-lg">Ne payez jamais le prix fort 💙</h2>
          <p className="mt-1 max-w-sm text-body-md opacity-90">
            Prixes compare le même produit entre les magasins et stations-service près de chez
            vous, et vous montre en un instant où il coûte le moins cher.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-label-sm font-medium">
              <Icon name="search" className="text-[16px]" /> Comparateur de prix
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-label-sm font-medium">
              <Icon name="location_on" className="text-[16px]" /> Magasins proches
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-label-sm font-medium">
              <Icon name="notifications_active" className="text-[16px]" /> Alertes de baisse
            </span>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-headline-md text-on-surface">
          <Icon name="apps" className="text-primary" /> Mes outils
        </h2>
        <div className="grid grid-cols-2 gap-gutter">
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              data-tour={s.href === "/stores" ? "shortcut-stores" : undefined}
              className="card flex items-center gap-3 p-4 active:scale-95"
            >
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
            <Icon name="trending_up" className="text-primary" /> Produits populaires
          </h2>
          <Link href="/courses" className="text-label-lg text-primary">
            Tout voir
          </Link>
        </div>
        <div className="space-y-3">
          {top.length === 0 && (
            <div className="card flex flex-col items-center gap-2 p-8 text-center text-on-surface-variant">
              <Icon name="grocery" className="text-[32px] text-outline-variant" />
              <p className="text-body-md">Catalogue en cours de chargement…</p>
            </div>
          )}
          {top.map((p) => (
            <ProductCard key={p.barcode} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
