"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { PageHeader } from "@/components/PageHeader";
import { ProductCard } from "@/components/ProductCard";
import { ScoreLegend } from "@/components/ScoreLegend";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";

// Only surface what the bottom tab bar does NOT already cover — Courses, Scanner,
// and Deals are permanent tabs, so putting them here too is redundant.
// These personal tools have no tab, so this is their quick access.
const SHORTCUTS = [
  { href: "/list", label: "Ma liste", icon: "list_alt", box: "bg-primary-fixed-dim/15 text-primary-fixed-dim" },
  { href: "/alerts", label: "Alertes", icon: "notifications_active", box: "bg-secondary-fixed-dim/15 text-secondary-fixed-dim" },
  { href: "/stores", label: "Magasins", icon: "store", box: "bg-primary-fixed-dim/15 text-primary-fixed-dim" },
  { href: "/feedback", label: "Mon avis", icon: "reviews", box: "bg-secondary-fixed-dim/15 text-secondary-fixed-dim" },
];

export default function HomePage() {
  const router = useRouter();
  const { user } = useApp();
  const [query, setQuery] = useState("");

  // Popular products (not deals) so tapping a card opens the in-app product sheet
  // rather than leaving to an external merchant site.
  const { data } = useQuery({ queryKey: ["products", "browse"], queryFn: () => api.browseProducts() });
  const top = data?.items.slice(0, 6) ?? [];

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/courses?q=${encodeURIComponent(q)}` : "/courses");
  }

  return (
    <div>
      <PageHeader title="Prixes" />

      <section
        className="relative mb-6 overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br
                   from-[#f5fdeb] via-[#e8fcf0] to-[#d8f2ff] p-6 shadow-float
                   dark:border-white/10 dark:from-surface-container dark:via-[#1a3a2a] dark:to-[#0a2540]"
      >
        {/* Prixes logo, bleeding off the top-right */}
        <LogoMark className="pointer-events-none absolute -top-16 -right-12 h-56 w-56 opacity-90 drop-shadow-[0_8px_24px_rgba(157,217,46,0.3)] sm:h-64 sm:w-64 sm:-right-16" decorative />

        <div className="relative z-10 pr-20 sm:pr-24">
          <h2 className="max-w-[15ch] text-headline-lg font-bold tracking-tight text-on-surface">
            Ne payez jamais le prix fort&nbsp;💙
          </h2>
          <p className="mt-2 max-w-[28ch] text-body-md text-on-surface-variant">
            Comparez le même produit dans les magasins près de chez vous, et voyez le prix le plus
            bas en un instant.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { icon: "search", label: "Comparateur de prix" },
              { icon: "location_on", label: "Magasins proches" },
              { icon: "notifications_active", label: "Alertes de baisse" },
            ].map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70
                           px-3 py-1.5 text-label-sm font-medium text-on-surface shadow-sm backdrop-blur
                           dark:border-white/10 dark:bg-white/10"
              >
                <Icon name={c.icon} className="text-[16px] text-primary" /> {c.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Greeting */}
      <section className="mb-6">
        <h2 className="text-headline-xl-mobile font-bold tracking-tight text-on-surface">
          Bonjour{user ? `, ${user.username}` : ""}&nbsp;👋
        </h2>
        <p className="mt-0.5 text-body-md text-on-surface-variant">
          Prêt à optimiser vos achats aujourd&apos;hui&nbsp;?
        </p>
      </section>

      {/* Search — jumps straight into the product comparison flow */}
      <form
        onSubmit={onSearch}
        role="search"
        className="mb-8 flex items-center gap-2 rounded-full border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 shadow-card focus-within:border-primary"
      >
        <Icon name="search" className="text-on-surface-variant" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent text-body-md outline-none"
          placeholder="Rechercher un produit, une marque…"
          aria-label="Rechercher un produit"
          enterKeyHint="search"
        />
      </form>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-headline-md text-on-surface">
          <Icon name="apps" className="text-primary-fixed-dim" /> Mes outils
        </h2>
        <div className="grid grid-cols-2 gap-gutter">
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              data-tour={s.href === "/stores" ? "shortcut-stores" : undefined}
              className="card flex flex-col items-center gap-3 p-5 text-center active:scale-95"
            >
              <span className={`flex h-14 w-14 items-center justify-center rounded-full ${s.box}`}>
                <Icon name={s.icon} fill className="text-[28px]" />
              </span>
              <span className="text-label-lg text-on-surface">{s.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section data-tour="products-list">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-headline-md text-on-surface">
            <Icon name="trending_up" className="text-primary-fixed-dim" /> Produits populaires
          </h2>
          <div className="flex items-center gap-2">
            <ScoreLegend compact />
            <Link href="/courses" className="text-label-lg font-bold text-primary-fixed-dim hover:text-secondary-fixed-dim transition-colors">
              Tout voir
            </Link>
          </div>
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
