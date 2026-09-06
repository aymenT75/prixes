"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BargainCard } from "@/components/BargainCard";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ProductCard } from "@/components/ProductCard";
import { ScoreLegend } from "@/components/ScoreLegend";
import { WhatsNew } from "@/components/WhatsNew";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { createVoiceRecognizer, speechSupported } from "@/lib/voice";

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
  const [listening, setListening] = useState(false);

  // Whether this browser can dictate is only knowable in the browser: deciding it
  // during render would make the prerendered HTML disagree with the first client
  // render, and React would throw the page away to recover.
  const [canDictate, setCanDictate] = useState(false);
  useEffect(() => setCanDictate(speechSupported()), []);

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

  /** Dictate instead of typing — same field, same result. */
  function dictate() {
    const recognizer = createVoiceRecognizer();
    if (!recognizer) return;
    setListening(true);
    recognizer.onPartial = setQuery;
    recognizer.onFinal = (text) => {
      setQuery(text);
      setListening(false);
      recognizer.stop();
      if (text.trim().length >= 2) go(text);
    };
    recognizer.onError = () => setListening(false);
    recognizer.onEnd = () => setListening(false);
    recognizer.start();
  }

  return (
    <div>
      <PageHeader title="Prixes" />

      {/* Frosted panel: a soft grey ground, two blurred colour blooms behind it,
          and the cart drawn inline rather than fetched — it is the first thing
          painted, so it must not wait on a network round trip. */}
      <section className="relative mb-6 overflow-hidden rounded-[28px] border border-white/70 bg-gradient-to-br from-[#f2f4f6] via-[#f6f8f9] to-[#eef2f4] p-6 shadow-float dark:border-white/10 dark:from-surface-container dark:via-[#16211c] dark:to-[#0e1a24] sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary-fixed-dim/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-secondary-fixed-dim/20 blur-3xl"
        />

        <div className="relative z-10 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-headline-md font-bold italic tracking-tight text-on-surface">
              Pri<span className="text-primary-fixed-dim [text-shadow:0_0_18px_rgb(var(--color-primary-fixed-dim)/0.55)]">x</span>es
            </p>

            <h2 className="mt-3 max-w-[11ch] text-headline-lg font-bold leading-[1.08] tracking-tight text-on-surface sm:max-w-[13ch]">
              Ne payez jamais le prix fort
            </h2>
            <p className="mt-2 max-w-[24ch] text-body-md text-on-surface-variant sm:max-w-[28ch]">
              Comparez les prix des produits entre les magasins et trouvez le tarif le plus
              bas en un instant.
            </p>
          </div>

          <CartArtwork className="h-24 w-24 flex-shrink-0 sm:h-32 sm:w-32 md:h-44 md:w-44" />
        </div>

        <div className="relative z-10 mt-5 flex flex-wrap gap-2">
          {[
            { path: "/courses", label: "Comparateur" },
            { path: "/stores", label: "Magasins" },
            { path: "/alerts", label: "Alertes" },
          ].map((c) => (
            <button
              key={c.label}
              onClick={() => router.push(c.path)}
              className="rounded-full border border-white/80 bg-white/60 px-5 py-2.5 text-label-md
                         font-medium text-on-surface shadow-sm backdrop-blur-md
                         transition-transform active:scale-95
                         dark:border-white/10 dark:bg-white/10"
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

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
        {canDictate && (
          <button
            type="button"
            onClick={listening ? () => setListening(false) : dictate}
            aria-label={listening ? "Arrêter la dictée" : "Dicter votre recherche"}
            className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full transition-colors ${
              listening ? "bg-error text-on-error" : "bg-surface-container text-primary"
            } active:scale-95`}
          >
            <Icon name={listening ? "stop" : "mic"} className="text-[20px]" />
          </button>
        )}
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

/**
 * The shopping cart that greets people on the home panel.
 *
 * Inline rather than an <img>: it is above the fold on first paint, and a
 * network round trip for the one thing people see first is a poor trade for a
 * shape this simple. Strokes only, so it stays crisp at any size.
 */
function CartArtwork({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="cart-body" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(var(--color-primary-fixed-dim))" />
          <stop offset="55%" stopColor="rgb(var(--color-tertiary-fixed))" />
          <stop offset="100%" stopColor="rgb(var(--color-secondary-fixed-dim))" />
        </linearGradient>
        <linearGradient id="cart-fill" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(var(--color-primary-fixed-dim))" stopOpacity="0.45" />
          <stop offset="100%" stopColor="rgb(var(--color-secondary-fixed-dim))" stopOpacity="0.30" />
        </linearGradient>
      </defs>

      {/* Basket, drawn as one open shape so the gradient runs through it. */}
      <path
        d="M34 34 H104 L94 74 H44 Z"
        fill="url(#cart-fill)"
        stroke="url(#cart-body)"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      {/* The fold that gives the basket its facet. */}
      <path d="M34 34 L69 56 L104 34" fill="none" stroke="url(#cart-body)" strokeWidth="4" strokeOpacity="0.5" strokeLinejoin="round" />
      {/* Handle down to the axle. */}
      <path
        d="M12 18 H26 L34 34 M44 74 H92"
        fill="none"
        stroke="url(#cart-body)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="52" cy="94" r="9" fill="url(#cart-fill)" stroke="url(#cart-body)" strokeWidth="5" />
      <circle cx="88" cy="94" r="9" fill="url(#cart-fill)" stroke="url(#cart-body)" strokeWidth="5" />
    </svg>
  );
}
