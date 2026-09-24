"use client";

/**
 * Un caddie par magasin.
 *
 * Shared by the shopping list and the weekly menu so the two can never quote
 * different totals for the same basket.
 *
 * The saving sits on the tab rather than in the detail, because that is the only
 * decision being made: is the second stop worth it today.
 */

import { useState } from "react";

import { Icon } from "@/components/Icon";
import { eur } from "@/lib/format";
import type { SplitResult } from "@/lib/types";

export function StorePlan({
  result,
  emptyMessage = "Aucun prix connu pour vos produits. Ajoutez des prix depuis les fiches produit.",
}: {
  result: SplitResult;
  emptyMessage?: string;
}) {
  const [chosen, setChosen] = useState(0);

  if (result.options.length === 0) {
    return (
      <div className="card mt-4 p-4 text-center text-on-surface-variant">
        <Icon name="info" className="text-[24px]" />
        <p className="mt-1 text-body-md">{emptyMessage}</p>
      </div>
    );
  }

  const option = result.options[Math.min(chosen, result.options.length - 1)];

  return (
    <div className="mt-4 space-y-4">
      {result.options.length > 1 && (
        <div className="flex gap-2" role="tablist" aria-label="Nombre de magasins">
          {result.options.map((o, i) => (
            <button
              key={o.stores.join("+")}
              role="tab"
              aria-selected={i === chosen}
              onClick={() => setChosen(i)}
              className={`flex-1 rounded-xl px-3 py-2 ${
                i === chosen
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              <span className="block text-label-md">
                {o.stores.length} magasin{o.stores.length > 1 ? "s" : ""}
              </span>
              {/* A tab shows a saving only when the two plans buy the same
                  things. When the extra stop finds items the first store does
                  not stock, the higher total is those items — so say that
                  instead of a price that looks like a bad deal. */}
              <span className="block text-micro">
                {o.extra_items > 0
                  ? `+${o.extra_items} article${o.extra_items > 1 ? "s" : ""}`
                  : o.saving_vs_single != null && o.saving_vs_single > 0
                    ? `−${eur(o.saving_vs_single)}`
                    : eur(o.total)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-primary-container p-5 text-on-primary-container shadow-float">
        {/* "Tout au même endroit" above a list of four things to find elsewhere
            reads as a bug. Only claim it when the basket really is complete. */}
        <p className="text-micro uppercase tracking-widest opacity-90">
          {option.stores.length > 1
            ? "Votre tournée"
            : option.missing.length === 0
              ? "Tout au même endroit"
              : "Le gros des courses ici"}
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="text-headline-lg">{option.stores.join(" puis ")}</span>
          <span className="text-headline-lg">{eur(option.total)}</span>
        </div>
        <p className="mt-1 text-label-md opacity-90">
          {option.items_covered}/{option.items_total} articles
          {option.extra_items > 0
            ? ` · ${option.extra_items} que vous ne trouviez pas en un seul magasin`
            : option.saving_vs_single != null && option.saving_vs_single > 0
              ? ` · ${eur(option.saving_vs_single)} de moins qu'en un seul magasin`
              : ""}
        </p>
      </div>

      {/* The number people share. Quoted only against a store that sells every
          item of this plan, so it compares one trolley with the same trolley. */}
      {option.saving_vs_priciest != null && option.priciest_store && (
        <div className="card flex items-center gap-3 p-4" role="status">
          <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-primary-container text-on-primary-container">
            <Icon name="savings" fill className="text-[22px]" />
          </span>
          <p className="min-w-0 text-body-md text-on-surface-variant">
            <span className="block text-headline-md text-primary">
              {eur(option.saving_vs_priciest)} économisés
            </span>
            par rapport au même panier chez {option.priciest_store}
          </p>
        </div>
      )}

      {option.baskets.map((basket) => (
        <section key={basket.store} className="card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-headline-md text-on-surface">{basket.store}</h3>
            <span className="text-headline-md text-primary">{eur(basket.subtotal)}</span>
          </div>
          <ul className="mt-2">
            {basket.items.map((item) => (
              <li
                key={item.barcode}
                className="flex items-baseline justify-between gap-3 border-b border-outline-variant py-2 last:border-0"
              >
                <span className="min-w-0 truncate text-body-md text-on-surface">
                  {item.quantity > 1 && (
                    <span className="mr-1 text-primary">×{item.quantity}</span>
                  )}
                  {item.label}
                </span>
                <span className="flex-shrink-0 text-micro text-on-surface-variant">
                  {eur(item.line_total)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Catalogue names carry their own commas ("Vinaigrette huile, 250ml"), so a
          comma-joined run-on is unreadable. One line per item instead. */}
      {option.missing.length > 0 && (
        <div className="text-micro text-on-surface-variant">
          <p className="mb-1 font-bold">À trouver ailleurs</p>
          <ul className="space-y-0.5">
            {option.missing.map((name) => (
              <li key={name} className="truncate">
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.unpriced.length > 0 && (
        <div className="text-micro text-on-surface-variant">
          <p className="mb-1 font-bold">
            {result.unpriced.length} article{result.unpriced.length > 1 ? "s" : ""} sans prix
            connu, non compté{result.unpriced.length > 1 ? "s" : ""}
          </p>
          <ul className="space-y-0.5">
            {result.unpriced.map((name) => (
              <li key={name} className="truncate">
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
