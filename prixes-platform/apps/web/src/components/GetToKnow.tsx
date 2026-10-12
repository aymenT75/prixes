"use client";

/**
 * "Faisons connaissance": until someone has said how many they are at home and
 * what they like to eat, the home page asks — the same questionnaire as the
 * weekly menu, so the answers serve both. Everything after is personalised:
 * the week's list, the menus, the portions.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { DEFAULT_PREFERENCES, MealQuestionnaire } from "@/components/MealQuestionnaire";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import type { MealPreferences } from "@/lib/types";
import { useA11y } from "@/lib/useA11y";

const LATER_KEY = "prixes.home.knowlater";

export function GetToKnow() {
  const { user } = useApp();
  const qc = useQueryClient();
  const allergens = useA11y((s) => s.allergens);
  const diets = useA11y((s) => s.diets);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<MealPreferences | null>(null);
  // "Plus tard" holds for the day; read after mount (static export).
  const [later, setLater] = useState(true);
  useEffect(() => {
    try {
      setLater(localStorage.getItem(LATER_KEY) === new Date().toDateString());
    } catch {
      setLater(false);
    }
  }, []);

  const { data: prefs, isSuccess } = useQuery({
    queryKey: ["meal-prefs"],
    queryFn: () => api.getMealPreferences(),
    enabled: !!user,
  });
  const save = useMutation({
    mutationFn: (p: MealPreferences) =>
      api.saveMealPreferences({ ...p, avoid_allergens: allergens, diets }),
    onSuccess: (saved) => {
      qc.setQueryData(["meal-prefs"], saved);
      setDone(saved);
      setOpen(false);
    },
  });

  if (!user || !isSuccess) return null;
  if (done) {
    return (
      <p className="prixes-rise mb-5 flex items-center gap-2 rounded-2xl bg-tertiary-container p-4 text-body-md text-on-tertiary-container" role="status">
        <Icon name="check_circle" fill className="text-[22px]" />
        Merci ! Vos listes et vos menus seront faits pour {done.servings} personne{done.servings > 1 ? "s" : ""}.
      </p>
    );
  }
  if (prefs || later) return null;

  if (open) {
    return (
      <div className="mb-5">
        <MealQuestionnaire
          initial={DEFAULT_PREFERENCES}
          allergens={allergens}
          saving={save.isPending}
          onDone={(p) => save.mutate(p)}
          onCancel={() => setOpen(false)}
          doneLabel="C'est noté"
        />
      </div>
    );
  }

  return (
    <section
      aria-labelledby="t-know"
      className="prixes-rise mb-5 rounded-2xl border-2 border-primary-container bg-primary-container/20 p-4"
    >
      <h2 id="t-know" className="flex items-center gap-2 text-label-lg text-on-surface">
        <Icon name="waving_hand" className="text-[22px]" /> Faisons connaissance
      </h2>
      <p className="mt-1 text-body-md text-on-surface">
        Combien êtes-vous à la maison, et qu&apos;aimez-vous manger ? Avec vos réponses, je prépare des
        listes et des menus faits pour vous.
      </p>
      <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-2">
        <button onClick={() => setOpen(true)} className="btn-primary py-3">
          Répondre · 1 min
        </button>
        <button
          onClick={() => {
            setLater(true);
            try {
              localStorage.setItem(LATER_KEY, new Date().toDateString());
            } catch {
              /* storage blocked */
            }
          }}
          className="btn-outline py-3"
        >
          Plus tard
        </button>
      </div>
    </section>
  );
}
