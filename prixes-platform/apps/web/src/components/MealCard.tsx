"use client";

/**
 * One meal of the week: its photo, its day, its title, and on demand its
 * ingredients. Swapping it redoes this meal alone.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { api, apiAsset } from "@/lib/api";
import type { MealPlanMeal } from "@/lib/types";

export function MealCard({
  meal,
  onRegenerate,
  busy,
  canRegenerate,
}: {
  meal: MealPlanMeal;
  onRegenerate: () => void;
  busy: boolean;
  canRegenerate: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <MealPhoto title={meal.title} />
        <div className="min-w-0 flex-1">
          <p className="text-micro uppercase tracking-wider text-on-surface-variant">
            {meal.day_label} · {meal.slot}
          </p>
          <p className="line-clamp-2 text-label-lg text-on-surface">{meal.title}</p>
        </div>
        {canRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={busy}
            aria-label={`Changer le repas du ${meal.day_label}`}
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface-container text-on-surface active:scale-90 disabled:opacity-50"
          >
            <Icon name="refresh" className="text-[18px]" />
          </button>
        )}
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? "Masquer les ingrédients" : "Voir les ingrédients"}
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface-container text-on-surface active:scale-90"
        >
          <Icon name={open ? "expand_less" : "expand_more"} className="text-[18px]" />
        </button>
      </div>

      {open && (
        <ul className="mt-2 space-y-1 border-t border-outline-variant pt-2">
          {meal.ingredients.map((line, i) => (
            <li key={`${line.product_name}-${i}`} className="flex justify-between text-body-md">
              <span className="min-w-0 truncate text-on-surface">
                {line.matched_name ?? line.product_name}
              </span>
              <span className="ml-3 flex-shrink-0 text-micro text-on-surface-variant">
                {String(line.amount).replace(/\.0+$/, "").replace(".", ",")} {line.unit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The dish's photo. It is drawn the first time a title is seen (~10 s), so the
 * card shows a placeholder meanwhile, and the icon for good when there is no
 * photo to be had — the menu never waits on it.
 */
function MealPhoto({ title }: { title: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["meal-photo", title],
    queryFn: () => api.mealPhoto(title),
    staleTime: Infinity,
    retry: false,
    // No photo yet (the image service said "not now") is worth asking again a
    // little later — twice, then the icon stays.
    refetchInterval: (query) =>
      query.state.data?.url === null && query.state.dataUpdateCount < 3 ? 30_000 : false,
  });
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const url = data?.url && !broken ? apiAsset(data.url) : null;

  return (
    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-surface-container">
      {(!url || !loaded) && (
        <span
          className={`absolute inset-0 grid place-items-center text-on-surface-variant ${
            isPending || (url && !loaded) ? "animate-pulse" : ""
          }`}
        >
          <Icon name="restaurant" className="text-[28px] opacity-50" />
        </span>
      )}
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- static export: no image optimiser
        <img
          src={url}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
