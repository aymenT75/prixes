"use client";

/**
 * "Où voulez-vous faire vos courses ?" — the shops around you that sell your
 * list, each with its distance and its total, so the choice between the closest
 * and the cheapest is yours to make.
 *
 * Prices are per chain (Open Prices records them by store brand); the distance
 * is to that chain's nearest branch.
 */

import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { distance, eur } from "@/lib/format";
import { getCurrentPosition } from "@/lib/geo";
import { findBranch } from "@/lib/stores";
import type { SplitResult, Store, StoreBasketDetail } from "@/lib/types";

export interface NearbyPick {
  basket: StoreBasketDetail;
  branch: Store;
}

type Status = "locating" | "ready" | "denied" | "none";

export function NearbyStoreChoice({
  plan,
  onPick,
  onUnavailable,
}: {
  plan: SplitResult;
  onPick: (pick: NearbyPick) => void;
  /** No position or no shop near enough: the parent shows the plain comparison. */
  onUnavailable: () => void;
}) {
  const [status, setStatus] = useState<Status>("locating");
  const [picks, setPicks] = useState<NearbyPick[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    getCurrentPosition()
      .then((pos) => api.storesNearby(pos.lat, pos.lon, 10, 50))
      .then((res) => {
        if (!alive) return;
        const found: NearbyPick[] = [];
        for (const basket of plan.by_store ?? []) {
          const branch = findBranch(res.items, basket.store);
          if (branch) found.push({ basket, branch });
        }
        found.sort((a, b) => a.branch.distance_km - b.branch.distance_km);
        setPicks(found);
        setStatus(found.length ? "ready" : "none");
        if (!found.length) onUnavailable();
      })
      .catch(() => {
        if (!alive) return;
        setStatus("denied");
        onUnavailable();
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per comparison
  }, [plan]);

  if (status === "locating") {
    return (
      <p className="flex items-center gap-2 py-8 text-body-md text-on-surface-variant" role="status">
        <Icon name="progress_activity" className="animate-spin text-primary" /> Je cherche les magasins
        autour de vous…
      </p>
    );
  }
  if (status === "denied") {
    return (
      <p className="mt-3 rounded-xl bg-surface-container p-3 text-body-md text-on-surface-variant" role="status">
        <Icon name="location_on" className="mr-1 align-[-4px] text-[20px] text-primary" />
        Autorisez la localisation pour voir les magasins près de chez vous. En attendant, voici la
        comparaison par enseigne.
      </p>
    );
  }
  if (status === "none") {
    return (
      <p className="mt-3 rounded-xl bg-surface-container p-3 text-body-md text-on-surface-variant" role="status">
        Aucun magasin qui vend votre liste à moins de 10 km. Voici la comparaison par enseigne.
      </p>
    );
  }

  const itemsTotal = plan.options[0]?.items_total ?? Math.max(...picks.map((p) => p.basket.items.length));
  const most = Math.max(...picks.map((p) => p.basket.items.length));
  // A corner shop that sells 2 items of 33 is near but no answer: the list
  // shows the shops selling at least half of what the best-stocked one does.
  const useful = picks.filter((p) => p.basket.items.length * 2 >= most);
  const others = picks.length - useful.length;
  const shown = showAll ? picks : useful;
  const nearest = useful[0];
  // "Le moins cher" only among the shops that sell the most of the list: a shop
  // with half the items is not cheaper, it is emptier.
  const cheapest = picks
    .filter((p) => p.basket.items.length === most)
    .reduce((a, b) => (b.basket.subtotal < a.basket.subtotal ? b : a));

  return (
    <div className="mt-3">
      <p className="mb-3 text-body-md text-on-surface-variant">
        Magasins à moins de 10 km qui vendent votre liste. Touchez celui où vous voulez aller.
      </p>
      <ul className="space-y-3">
        {shown.map((p) => {
          const isNearest = p === nearest;
          const isCheapest = p === cheapest;
          const covered = p.basket.items.length;
          return (
            <li key={p.basket.store}>
              <button
                onClick={() => onPick(p)}
                className={`card w-full p-4 text-left transition-shadow hover:shadow-float ${
                  isCheapest ? "ring-2 ring-primary" : ""
                }`}
              >
                {(isNearest || isCheapest) && (
                  <span className="mb-2 flex flex-wrap gap-2">
                    {isCheapest && (
                      <span className="rounded-full bg-primary px-3 py-1 text-label-md text-on-primary">
                        Le moins cher
                      </span>
                    )}
                    {isNearest && (
                      <span className="rounded-full bg-primary-container px-3 py-1 text-label-md text-on-primary-container">
                        Le plus proche
                      </span>
                    )}
                  </span>
                )}
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-headline-md text-on-surface">{p.basket.store}</span>
                  <span className="text-headline-md text-primary">{eur(p.basket.subtotal)}</span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-md text-on-surface-variant">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="near_me" className="text-[18px] text-primary" />
                    {distance(p.branch.distance_km)}
                  </span>
                  <span>
                    {covered} article{covered > 1 ? "s" : ""} sur {itemsTotal}
                  </span>
                </span>
                {p.branch.address && (
                  <span className="mt-1 block break-words text-micro text-on-surface-variant">
                    {p.branch.address}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {others > 0 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-1 text-label-md text-primary"
        >
          Voir {others} autre{others > 1 ? "s" : ""} magasin{others > 1 ? "s" : ""}, qui vend
          {others > 1 ? "ent" : ""} moins de produits de la liste
        </button>
      )}
    </div>
  );
}
