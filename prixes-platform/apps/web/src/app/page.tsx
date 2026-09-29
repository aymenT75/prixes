"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BargainCard } from "@/components/BargainCard";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ProductCard } from "@/components/ProductCard";
import { ScoreLegend } from "@/components/ScoreLegend";
import { VoiceHero } from "@/components/VoiceHero";
import { WhatsNew } from "@/components/WhatsNew";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";

// Only surface what the bottom tab bar does NOT already cover — Courses, Scanner,
// and Deals are permanent tabs, so putting them here too is redundant.
// These personal tools have no tab, so this is their quick access.
const SHORTCUTS = [
  { href: "/list", label: "Ma liste", icon: "list_alt", box: "bg-primary/10 text-primary" },
  { href: "/alerts", label: "Alertes", icon: "notifications_active", box: "bg-secondary-fixed-dim/15 text-secondary-fixed-dim" },
  { href: "/stores", label: "Magasins", icon: "store", box: "bg-primary/10 text-primary" },
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

  // Real price drops from our own price history — no external catalog dependency,
  // so the section only renders once we actually have some.
  const { data: bargainsData } = useQuery({
    queryKey: ["products", "bargains"],
    queryFn: () => api.bargains(),
  });
  const bargains = bargainsData?.items ?? [];

  function go(text: string) {
    const q = text.trim();
    router.push(q ? `/courses?q=${encodeURIComponent(q)}` : "/courses");
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    go(query);
  }

  return (
    <div>
      <PageHeader title="Prixes" />

      {/* The microphone first: the Caddie listens, one tap and you speak. The
          old hero told people what Prixes does; this one lets them do it. */}
      <VoiceHero />

      {/* Searching is the first thing people come here to do, so it sits directly
          under the hero rather than below the feed — and the microphone sits in
          the field itself, so dictating and typing are the same gesture. */}
      <form
        onSubmit={onSearch}
        role="search"
        className="mb-6 flex items-center gap-2 rounded-full border border-outline-variant/40 bg-surface-container-lowest py-2 pl-4 pr-2 shadow-card focus-within:border-primary"
      >
        <Icon name="search" className="text-on-surface-variant" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-body-md outline-none"
          placeholder="Rechercher un produit, une marque…"
          aria-label="Rechercher un produit"
          enterKeyHint="search"
        />
      </form>

      <WhatsNew />

      {/* Real price drops, own data only — hidden entirely when we have none. */}
      {bargains.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-headline-md text-on-surface">
            <Icon name="local_offer" className="text-error" /> Bonnes affaires
          </h2>
          <div className="-mx-margin-mobile flex gap-3 overflow-x-auto px-margin-mobile pb-1">
            {bargains.map((b) => (
              <BargainCard key={`${b.barcode}-${b.store}`} bargain={b} />
            ))}
          </div>
        </section>
      )}

      {/* Greeting */}
      <section className="mb-6">
        <h2 className="text-headline-xl-mobile font-bold tracking-tight text-on-surface">
          Bonjour{user ? `, ${user.username}` : ""}&nbsp;👋
        </h2>
        <p className="mt-0.5 text-body-md text-on-surface-variant">
          Prêt à optimiser vos achats aujourd&apos;hui&nbsp;?
        </p>
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
            <Icon name="trending_up" className="text-primary" /> Produits populaires
          </h2>
          <div className="flex items-center gap-2">
            <ScoreLegend compact />
            <Link href="/courses" className="text-label-lg font-bold text-primary underline underline-offset-4 hover:text-secondary transition-colors">
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
