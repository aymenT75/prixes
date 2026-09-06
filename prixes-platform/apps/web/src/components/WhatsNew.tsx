"use client";

/**
 * Ce qui vient d'arriver dans Prixes.
 *
 * Three rules shape this block.
 *
 * It says what each feature *does for you*, not what it is called — "dites une
 * raclette pour 6" lands where "assistant IA" does not.
 *
 * It never advertises something that cannot run: each entry is gated on the same
 * capability flags the features themselves use, so a missing model key hides the
 * row instead of promising a dead end.
 *
 * It can be dismissed, and remembers. A "Nouveau" banner that never leaves stops
 * meaning new and becomes furniture.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";

// Bump the suffix when there is genuinely something new to announce: everyone
// who dismissed the previous round sees the next one.
const DISMISSED_KEY = "prixes.whatsnew.v4";

type Entry = {
  href: string;
  icon: string;
  title: string;
  body: string;
  tint: string;
  available: boolean;
};

export function WhatsNew() {
  const [hidden, setHidden] = useState(true);

  // Read on mount, not during render: localStorage does not exist on the server
  // and the markup must match on both sides.
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setHidden(false); // private mode: showing it once is better than never
    }
  }, []);

  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => api.meta(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* nothing to remember it with — it will come back, which is harmless */
    }
  }

  const entries: Entry[] = [
    {
      href: "/list",
      icon: "auto_awesome",
      title: "Dictez vos courses",
      body: "Dites « une raclette pour 6 » : la liste se monte et se chiffre toute seule.",
      tint: "bg-primary-fixed-dim/15 text-primary",
      available: meta?.smart_assistant_enabled ?? false,
    },
    {
      href: "/list",
      icon: "savings",
      title: "Le caddie le moins cher",
      body: "Vos courses réparties par magasin, et ce que le second arrêt fait gagner.",
      tint: "bg-secondary-fixed-dim/15 text-secondary",
      // Prices are the app's own data — this one always works.
      available: true,
    },
    {
      href: "/courses?q=pommes+de+terre",
      icon: "nutrition",
      title: "Les fruits et légumes au poids",
      body: "Pommes de terre, carottes, courgettes : comparés au kilo, enseigne par enseigne.",
      tint: "bg-secondary-fixed-dim/15 text-secondary",
      // Prices come from our own catalogue, like the basket split.
      available: true,
    },
    {
      href: "/menu",
      icon: "calendar_month",
      title: "Menu de la semaine",
      body: "Sept repas, la liste de courses qui va avec, et où l'acheter au meilleur prix.",
      tint: "bg-primary-fixed-dim/15 text-primary",
      available: meta?.meal_plan_enabled ?? false,
    },
  ].filter((e) => e.available);

  if (hidden || entries.length === 0) return null;

  return (
    <section className="mb-6" aria-labelledby="whats-new-title">
      <div className="mb-3 flex items-center gap-2">
        <span className="chip bg-primary-container px-2.5 py-1 text-micro font-bold uppercase tracking-wider text-on-primary-container">
          Nouveau
        </span>
        <h2 id="whats-new-title" className="text-headline-md text-on-surface">
          Ce qui change
        </h2>
        <button
          onClick={dismiss}
          aria-label="Masquer les nouveautés"
          className="ml-auto grid h-8 w-8 place-items-center rounded-full text-outline-variant transition-colors hover:text-on-surface-variant"
        >
          <Icon name="close" className="text-[18px]" />
        </button>
      </div>

      <div className="space-y-2">
        {entries.map((e) => (
          <Link
            key={e.title}
            href={e.href}
            className="card flex items-center gap-3 p-3 transition-transform active:scale-[0.98]"
          >
            <span className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-full ${e.tint}`}>
              <Icon name={e.icon} className="text-[22px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-label-lg text-on-surface">{e.title}</span>
              <span className="block text-body-md text-on-surface-variant">{e.body}</span>
            </span>
            <Icon name="chevron_right" className="flex-shrink-0 text-[20px] text-outline-variant" />
          </Link>
        ))}
      </div>
    </section>
  );
}
