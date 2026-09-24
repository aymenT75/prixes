"use client";

/**
 * L'écran d'attente pendant que la semaine se compose (~30 s).
 *
 * The steps are the server's real steps, in their real order. Their timing is
 * paced on the clock, not measured — the request is a single call — so the last
 * step never ticks on its own: it waits for the answer.
 */

import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";

export function MenuWaiting({ meals, budget }: { meals: number; budget: boolean }) {
  const steps = [
    { label: "Lecture de vos réponses", doneAt: 1_500 },
    { label: `Composition des ${meals} repas`, doneAt: 16_000 },
    { label: "Recherche des produits en rayon", doneAt: 22_000 },
    { label: "Comparaison des magasins", doneAt: budget ? 26_000 : Infinity },
    ...(budget ? [{ label: "Vérification de votre budget", doneAt: Infinity }] : []),
  ];

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(timer);
  }, []);

  const current = steps.findIndex((s) => elapsed < s.doneAt);

  return (
    <section className="card animate-fade-in-up p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-container text-on-primary-container">
          <Icon name="restaurant_menu" className="animate-pulse text-[22px]" />
        </span>
        <div>
          <h2 className="text-headline-md text-on-surface">Votre semaine se prépare…</h2>
          <p className="text-micro text-on-surface-variant">Comptez une trentaine de secondes.</p>
        </div>
      </div>

      <ol className="mt-4 space-y-3">
        {steps.map((step, i) => {
          const done = current === -1 || i < current;
          const active = i === current;
          return (
            <li
              key={step.label}
              className={`flex items-center gap-3 text-body-md transition-opacity duration-300 ${
                done || active ? "text-on-surface" : "text-on-surface-variant opacity-50"
              }`}
            >
              <span className="grid h-6 w-6 flex-shrink-0 place-items-center">
                {done ? (
                  <Icon name="check_circle" fill className="animate-check-pop text-[22px] text-primary" />
                ) : active ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-outline-variant" />
                )}
              </span>
              <span className={active ? "font-semibold" : ""}>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
