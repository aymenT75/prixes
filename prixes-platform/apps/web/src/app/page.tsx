"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { NewsCard } from "@/components/NewsCard";
import { PageHeader } from "@/components/PageHeader";
import { TodayPromos } from "@/components/TodayPromos";
import { TodayShop } from "@/components/TodayShop";
import { WhatsNew } from "@/components/WhatsNew";
import { useApp } from "@/lib/store";

/**
 * Home: "Bonjour, où fait-on nos courses aujourd'hui ?" — and the answer is
 * already there. The app has priced the list around you (TodayShop), says
 * what it did on its own since the last visit (NewsCard), and shows the day's
 * promotions, yours first (TodayPromos). Search stays at hand underneath.
 */
export default function HomePage() {
  const router = useRouter();
  const { user } = useApp();
  const [query, setQuery] = useState("");

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/courses?q=${encodeURIComponent(q)}` : "/courses");
  }

  return (
    <div>
      <PageHeader title="Prixes" />

      <h2 className="prixes-rise mb-4 text-balance font-display text-[26px] font-extrabold leading-tight tracking-tight text-on-surface">
        Bonjour{user ? ` ${user.username}` : ""}, où fait-on nos courses aujourd&apos;hui&nbsp;?
      </h2>

      <TodayShop />
      <NewsCard />
      <TodayPromos />

      <form
        onSubmit={onSearch}
        role="search"
        className="mb-6 flex items-center gap-2 rounded-full border border-outline-variant/60 bg-surface-container-lowest py-2 pl-4 pr-2 focus-within:border-primary"
      >
        <Icon name="search" className="text-on-surface-variant" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-body-md outline-none"
          placeholder="Chercher un produit, une marque…"
          aria-label="Rechercher un produit"
          enterKeyHint="search"
        />
      </form>

      <WhatsNew />
    </div>
  );
}
