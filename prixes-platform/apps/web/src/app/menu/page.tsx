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
import { MealCard } from "@/components/MealCard";
import {
  DEFAULT_PREFERENCES,
  MealQuestionnaire,
  describePreferences,
} from "@/components/MealQuestionnaire";
import { MenuWaiting } from "@/components/MenuWaiting";
import { PageHeader } from "@/components/PageHeader";
import { RecipeImport } from "@/components/RecipeImport";
import { StorePlan } from "@/components/StorePlan";
import { ApiError, api } from "@/lib/api";
import { eur } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useA11y } from "@/lib/useA11y";
import type { MealPlan, MealPreferences } from "@/lib/types";

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
  const { user, openLogin, openPremium } = useApp();
  const { allergens, diets } = useA11y();
  const qc = useQueryClient();
  const week = mondayOf();

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  // Composing a week needs a model; only remembering it needs a document store.
  // Without one the plan lives for the session, and the per-meal redo — which
  // reads the stored week — is hidden rather than left to fail.
  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => api.meta(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const saved = meta?.meal_plan_saved ?? false;

  const { data: plan, isLoading } = useQuery({
    queryKey: ["meal-plan", week],
    queryFn: () => api.getMealPlan(week),
    enabled: !!user,
  });

  // The questionnaire's answers live on the account. Null means never answered,
  // which is what opens the questionnaire on a first visit.
  const { data: savedPrefs, isSuccess: prefsLoaded } = useQuery({
    queryKey: ["meal-prefs"],
    queryFn: () => api.getMealPreferences(),
    enabled: !!user,
  });
  const prefs = savedPrefs ?? DEFAULT_PREFERENCES;

  const { data: billing } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api.billingStatus(),
    enabled: !!user,
  });

  const generate = useMutation({
    mutationFn: async (p: MealPreferences) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GENERATE_DEADLINE_MS);
      try {
        return await api.generateMealPlan(
          {
            servings: p.servings,
            meals_per_day: p.meals_per_day,
            budget_eur: p.budget_eur,
            avoid_allergens: allergens,
            diets,
            goal: p.goal,
            equipment: p.equipment,
            styles: p.styles,
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
    onSuccess: (result) => {
      qc.setQueryData(["meal-plan", week], result);
      void qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e) => setError(messageFor(e)),
  });

  // Saving the answers comes first, then the week: a menu composed from answers
  // that were not kept would be redone from the old ones on the next visit.
  const savePrefs = useMutation({
    mutationFn: (p: MealPreferences) => api.saveMealPreferences(p),
    onSuccess: (_, p) => {
      qc.setQueryData(["meal-prefs"], p);
      setEditing(false);
      generate.mutate(p);
    },
    onError: (e) => setError(messageFor(e)),
  });

  const regenerate = useMutation({
    mutationFn: ({ day, slot }: { day: number; slot: string }) =>
      api.regenerateMeal(week, day, slot),
    onSuccess: (result) => qc.setQueryData(["meal-plan", week], result),
    onError: (e) => setError(messageFor(e)),
  });

  const toList = useMutation({
    mutationFn: () =>
      api.addBasketToList(
        (plan?.basket ?? [])
          .filter((line) => !line.optional)
          .map((line) => ({
            barcode: line.barcode,
            free_text: line.barcode ? null : line.product_name,
            name: line.matched_name ?? line.product_name,
            quantity: line.quantity,
            amount: line.amount,
            unit: line.unit,
            source: "mealplan",
          })),
      ),
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

      {editing || (prefsLoaded && savedPrefs === null && !plan && !isLoading) ? (
        <MealQuestionnaire
          initial={prefs}
          allergens={allergens}
          saving={savePrefs.isPending}
          onDone={(p) => savePrefs.mutate(p)}
          onCancel={savedPrefs || plan ? () => setEditing(false) : undefined}
        />
      ) : generate.isPending ? (
        <MenuWaiting
          meals={7 * (generate.variables?.meals_per_day ?? prefs.meals_per_day)}
          budget={!!generate.variables?.budget_eur}
        />
      ) : (
        <section className="card p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-label-lg text-on-surface">Votre foyer</h2>
              <p className="mt-1 text-body-md text-on-surface-variant">
                {describePreferences(prefs)}
              </p>
            </div>
            <button
              onClick={() => {
                setError(null);
                setEditing(true);
              }}
              className="flex flex-shrink-0 items-center gap-1 rounded-full bg-surface-container px-3 py-1.5 text-label-md text-on-surface active:scale-95"
            >
              <Icon name="tune" className="text-[16px]" />
              Modifier
            </button>
          </div>

          {allergens.length > 0 && (
            <p className="mt-3 text-micro text-on-surface-variant">
              <Icon name="shield" className="mr-1 align-[-3px] text-[14px] text-primary" />
              Vos allergènes ({allergens.join(", ")}) sont exclus de tous les repas.
            </p>
          )}

          {billing && !billing.premium && (
            <p className="mt-3 text-micro text-on-surface-variant">
              <Icon name="menu_book" className="mr-1 align-[-3px] text-[14px] text-primary" />
              Menus composés avec nos recettes.{" "}
              <button onClick={() => openPremium(true)} className="font-semibold text-primary underline">
                Des menus inventés sur mesure avec Premium
              </button>
            </p>
          )}

          <button
            onClick={() => generate.mutate(prefs)}
            className="btn-primary mt-4 w-full py-3"
          >
            <Icon name="restaurant_menu" className="text-[18px]" />
            {plan ? "Refaire toute la semaine" : "Composer ma semaine"}
          </button>
        </section>
      )}

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

      {plan && !saved && (
        <p className="mt-4 rounded-xl bg-surface-container p-3 text-micro text-on-surface-variant">
          Ce menu n&apos;est pas mémorisé : ajoutez les courses à votre liste avant de
          quitter la page.
        </p>
      )}

      {isLoading && <p className="py-10 text-center text-on-surface-variant">Chargement…</p>}

      {plan && !generate.isPending && !editing && (
        <>
          <PlanSummary plan={plan} onAdd={() => toList.mutate()} adding={toList.isPending} />
          <div className="mt-4 space-y-2">
            {plan.meals.map((meal) => (
              <MealCard
                key={`${meal.day}-${meal.slot}`}
                meal={meal}
                onRegenerate={() => regenerate.mutate({ day: meal.day, slot: meal.slot })}
                busy={regenerate.isPending}
                canRegenerate={saved}
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
