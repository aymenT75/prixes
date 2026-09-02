"use client";

/**
 * Menu de la semaine — seven days of meals, one shopping basket, one cheapest store.
 *
 * The answer people came for is the store and the total, so those sit at the top,
 * before the days. Each meal can be swapped on its own: regenerating the whole
 * week to change one dinner is the behaviour that makes planners get abandoned.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { RecipeImport } from "@/components/RecipeImport";
import { StorePlan } from "@/components/StorePlan";
import { ApiError, api } from "@/lib/api";
import { eur } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useA11y } from "@/lib/useA11y";
import type { MealPlan, MealPlanMeal } from "@/lib/types";

const GENERATE_DEADLINE_MS = 60_000;

function mondayOf(today = new Date()): string {
  const date = new Date(today);
  // getDay() is 0 for Sunday; shift so Monday starts the week.
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}

function messageFor(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Le menu met trop de temps à se générer. Réessayez.";
  }
  if (error instanceof ApiError) {
    if (error.status === 503) return "Le planificateur n'est pas disponible pour le moment.";
    return error.message;
  }
  return "Une erreur est survenue. Réessayez.";
}

export default function MenuPage() {
  const { user, openLogin } = useApp();
  const { allergens, diets } = useA11y();
  const qc = useQueryClient();
  const week = mondayOf();

  const [servings, setServings] = useState(2);
  const [mealsPerDay, setMealsPerDay] = useState<1 | 2>(1);
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["meal-plan", week],
    queryFn: () => api.getMealPlan(week),
    enabled: !!user,
  });

  const generate = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GENERATE_DEADLINE_MS);
      try {
        return await api.generateMealPlan(
          {
            servings,
            meals_per_day: mealsPerDay,
            budget_eur: budget ? Number(budget.replace(",", ".")) : null,
            avoid_allergens: allergens,
            diets,
          },
          controller.signal,
        );
      } finally {
        clearTimeout(timer);
      }
    },
    onMutate: () => {
      setError(null);
      setAdded(null);
    },
    onSuccess: (result) => qc.setQueryData(["meal-plan", week], result),
    onError: (e) => setError(messageFor(e)),
  });

  const regenerate = useMutation({
    mutationFn: ({ day, slot }: { day: number; slot: string }) =>
      api.regenerateMeal(week, day, slot),
    onSuccess: (result) => qc.setQueryData(["meal-plan", week], result),
    onError: (e) => setError(messageFor(e)),
  });

  const toList = useMutation({
    mutationFn: () => api.mealPlanToList(week),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["shopping"] });
      setAdded(
        `${res.added} article${res.added > 1 ? "s" : ""} ajouté${res.added > 1 ? "s" : ""}` +
          (res.merged ? `, ${res.merged} regroupé${res.merged > 1 ? "s" : ""}` : ""),
      );
    },
    onError: (e) => setError(messageFor(e)),
  });

  if (!user) {
    return (
      <div>
        <PageHeader title="Ma semaine" />
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Icon name="calendar_month" className="text-[48px] text-outline-variant" />
          <p className="text-on-surface-variant">
            Connectez-vous pour composer le menu de votre semaine.
          </p>
          <button onClick={() => openLogin(true)} className="btn-primary">
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Ma semaine" />

      <section className="card p-4">
        <h2 className="text-label-lg text-on-surface">Votre foyer</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-micro uppercase tracking-wider text-on-surface-variant">
              Personnes
            </span>
            <input
              type="number"
              min={1}
              max={12}
              value={servings}
              onChange={(e) => setServings(Math.max(1, Math.min(12, Number(e.target.value))))}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2 text-body-md text-on-surface"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-micro uppercase tracking-wider text-on-surface-variant">
              Budget (facultatif)
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="60 €"
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2 text-body-md text-on-surface placeholder:text-on-surface-variant"
            />
          </label>
        </div>

        <div className="mt-3 flex gap-2" role="group" aria-label="Repas par jour">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              onClick={() => setMealsPerDay(n)}
              aria-pressed={mealsPerDay === n}
              className={`flex-1 rounded-xl py-2 text-label-md ${
                mealsPerDay === n
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              {n === 1 ? "Dîners seulement" : "Midi et soir"}
            </button>
          ))}
        </div>

        {allergens.length > 0 && (
          <p className="mt-3 text-micro text-on-surface-variant">
            <Icon name="shield" className="mr-1 align-[-3px] text-[14px] text-primary" />
            Vos allergènes ({allergens.join(", ")}) sont exclus de tous les repas.
          </p>
        )}

        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="btn-primary mt-4 w-full py-3 disabled:opacity-50"
        >
          <Icon name="restaurant_menu" className="text-[18px]" />
          {generate.isPending
            ? "Composition du menu…"
            : plan
              ? "Refaire toute la semaine"
              : "Composer ma semaine"}
        </button>

        {generate.isPending && (
          <p role="status" aria-live="polite" className="mt-3 text-center text-body-md text-on-surface-variant">
            Sept repas, leurs ingrédients et les prix : comptez une trentaine de secondes.
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-error-container p-3 text-body-md text-on-error-container">
          {error}
        </p>
      )}
      {added && (
        <p role="status" className="mt-4 rounded-xl bg-primary-container p-3 text-body-md text-on-primary-container">
          {added}. <Link href="/list" className="underline">Voir ma liste</Link>
        </p>
      )}

      {isLoading && <p className="py-10 text-center text-on-surface-variant">Chargement…</p>}

      {plan && (
        <>
          <PlanSummary plan={plan} onAdd={() => toList.mutate()} adding={toList.isPending} />
          <div className="mt-4 space-y-2">
            {plan.meals.map((meal) => (
              <MealCard
                key={`${meal.day}-${meal.slot}`}
                meal={meal}
                onRegenerate={() => regenerate.mutate({ day: meal.day, slot: meal.slot })}
                busy={regenerate.isPending}
              />
            ))}
          </div>
        </>
      )}

      <RecipeImport />
    </div>
  );
}

function PlanSummary({
  plan,
  onAdd,
  adding,
}: {
  plan: MealPlan;
  onAdd: () => void;
  adding: boolean;
}) {
  return (
    <section className="mt-4">
      {/* The week ends the same way the shopping list does: with the trolleys.
          Same component, same numbers — a week and a list can't disagree. */}
      {plan.split ? (
        <StorePlan
          result={plan.split}
          emptyMessage="Aucun prix connu pour ces ingrédients : le menu tient, le chiffrage non."
        />
      ) : (
        <div className="card p-4 text-center text-on-surface-variant">
          <Icon name="info" className="text-[24px]" />
          <p className="mt-1 text-body-md">
            Aucun prix connu pour ces ingrédients : le menu tient, le chiffrage non.
          </p>
        </div>
      )}

      {plan.over_budget && (
        <p className="mt-3 rounded-xl bg-warning-soft p-3 text-body-md text-accent-warm">
          <Icon name="info" className="mr-1 align-[-4px] text-[18px]" />
          Je n&apos;ai pas réussi à tenir votre budget
          {plan.budget_attempts > 1 ? ", même en refaisant le menu" : ""}. Baissez le
          nombre de repas, ou acceptez le dépassement.
        </p>
      )}

      {plan.unpriced_count > 0 && (
        <p className="mt-3 text-center text-micro text-on-surface-variant">
          {plan.unpriced_count} ingrédient{plan.unpriced_count > 1 ? "s" : ""} sans prix
          connu, non compté{plan.unpriced_count > 1 ? "s" : ""}
        </p>
      )}

      <button onClick={onAdd} disabled={adding} className="btn-primary mt-3 w-full py-3 disabled:opacity-50">
        <Icon name="playlist_add" className="text-[18px]" />
        {adding ? "Ajout…" : `Ajouter les ${plan.basket.length} articles à ma liste`}
      </button>
    </section>
  );
}

function MealCard({
  meal,
  onRegenerate,
  busy,
}: {
  meal: MealPlanMeal;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-micro uppercase tracking-wider text-on-surface-variant">
            {meal.day_label} · {meal.slot}
          </p>
          <p className="truncate text-label-lg text-on-surface">{meal.title}</p>
        </div>
        <button
          onClick={onRegenerate}
          disabled={busy}
          aria-label={`Changer le repas du ${meal.day_label}`}
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface-container text-on-surface active:scale-90 disabled:opacity-50"
        >
          <Icon name="refresh" className="text-[18px]" />
        </button>
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
