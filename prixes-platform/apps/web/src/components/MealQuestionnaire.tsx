"use client";

/**
 * Le questionnaire du menu de la semaine — une question par écran.
 *
 * It replaces a form of three fields with six small decisions, because each one
 * is easier than the form was, and two of them (the kitchen, the kind of food)
 * are constraints the form never asked. The answers are saved on the account by
 * the page, not here: this component only collects them.
 */

import { useState } from "react";

import { Icon } from "@/components/Icon";
import type { MealEquipment, MealGoal, MealPreferences, MealStyle } from "@/lib/types";

type Choice<T extends string> = { value: T; label: string; hint?: string; icon: string };

const GOALS: Choice<MealGoal>[] = [
  { value: "budget", label: "Mieux gérer mon budget", icon: "savings" },
  { value: "temps", label: "Gagner du temps", icon: "schedule" },
  { value: "sante", label: "Manger plus sainement", icon: "eco" },
  { value: "idees", label: "Trouver des idées", icon: "lightbulb" },
];

const EQUIPMENT: Choice<MealEquipment>[] = [
  { value: "plaques", label: "Plaques", icon: "cooking" },
  { value: "four", label: "Four", icon: "oven_gen" },
  { value: "micro-ondes", label: "Micro-ondes", icon: "microwave" },
  { value: "airfryer", label: "Airfryer", icon: "mode_fan" },
  { value: "robot", label: "Robot cuiseur", icon: "blender" },
  { value: "autocuiseur", label: "Autocuiseur", icon: "soup_kitchen" },
];

const STYLES: Choice<MealStyle>[] = [
  { value: "rapide", label: "Rapide & facile", icon: "bolt" },
  { value: "healthy", label: "Healthy", icon: "spa" },
  { value: "classique", label: "Classique", icon: "restaurant" },
  { value: "economique", label: "Économique", icon: "euro" },
  { value: "reconfort", label: "Réconfort", icon: "favorite" },
  { value: "one-pot", label: "One pot", icon: "skillet" },
  { value: "monde", label: "Cuisine du monde", icon: "public" },
];

const MAX_STYLES = 4;

export const DEFAULT_PREFERENCES: MealPreferences = {
  servings: 2,
  children: 0,
  days: 7,
  dislikes: [],
  max_minutes: null,
  level: null,
  meals_per_day: 1,
  budget_eur: null,
  goal: null,
  equipment: ["plaques", "four"],
  styles: [],
};

/** One line for the summary card: "2 pers. · dîners · four, plaques · rapide". */
export function describePreferences(p: MealPreferences): string {
  const label = <T extends string>(list: Choice<T>[], v: T) =>
    list.find((c) => c.value === v)?.label.toLowerCase() ?? v;
  const kids = p.children ? ` + ${p.children} enfant${p.children > 1 ? "s" : ""}` : "";
  const days = p.days ?? 7;
  return [
    `${p.servings} adulte${p.servings > 1 ? "s" : ""}${kids}`,
    `${days} ${p.meals_per_day === 2 ? "jours, midi et soir" : "dîners"}`,
    p.max_minutes ? `${p.max_minutes} min max` : null,
    p.dislikes?.length ? `sans ${p.dislikes.join(", ").toLowerCase()}` : null,
    p.budget_eur ? `${String(p.budget_eur).replace(".", ",")} € max` : null,
    p.equipment.map((e) => label(EQUIPMENT, e)).join(", ") || null,
    p.styles.map((s) => label(STYLES, s)).join(", ") || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Budget first (who you are, what you spend, where you shop), then the food:
// everything after is held to that budget at that chain's prices.
const STEPS = ["servings", "meals", "budget", "store", "goal", "dislikes", "time", "equipment", "styles"] as const;

/** What people most often refuse to eat; "Rien de tout ça" clears it. */
const DISLIKES = [
  "Coriandre", "Champignons", "Olives", "Épicé", "Poisson", "Fruits de mer", "Aubergine",
  "Courgette", "Brocoli", "Épinards", "Fromages forts", "Abats", "Agneau", "Tofu",
];
const TIMES: { value: 20 | 30 | 45 | null; label: string }[] = [
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: null, label: "Peu importe" },
];
const LEVELS: { value: "debutant" | "a-l-aise" | "passionne"; label: string; hint: string; icon: string }[] = [
  { value: "debutant", label: "Débutant", hint: "Simple et inratable", icon: "egg" },
  { value: "a-l-aise", label: "À l'aise", hint: "Je me débrouille", icon: "skillet" },
  { value: "passionne", label: "Passionné", hint: "Rien ne me fait peur", icon: "local_fire_department" },
];

/** The chains people name; "Peu importe" lets Prixes pick the cheapest nearby. */
const CHAINS = ["Lidl", "Aldi", "E.Leclerc", "Carrefour", "Intermarché", "Auchan", "Super U", "Monoprix", "Franprix", "Netto"];

/** About 3 € per person and per meal: the week's suggested budget. */
export function suggestedBudget(
  p: Pick<MealPreferences, "servings" | "meals_per_day" | "children" | "days">,
): number {
  const portions = p.servings + (p.children ?? 0) / 2;
  return Math.round(3 * portions * (p.days ?? 7) * p.meals_per_day);
}

export function MealQuestionnaire({
  initial,
  allergens,
  saving,
  onDone,
  onCancel,
  doneLabel = "Composer ma semaine",
}: {
  /** The last button: on the home page the answers are only kept. */
  doneLabel?: string;
  initial: MealPreferences;
  allergens: string[];
  saving: boolean;
  onDone: (prefs: MealPreferences) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<MealPreferences>(initial);
  const [budgetText, setBudgetText] = useState(
    initial.budget_eur ? String(initial.budget_eur).replace(".", ",") : "",
  );

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const set = (patch: Partial<MealPreferences>) => setPrefs((p) => ({ ...p, ...patch }));

  const canContinue =
    (current !== "equipment" || prefs.equipment.length > 0) &&
    (current !== "styles" || prefs.styles.length > 0);

  function next() {
    if (current === "budget") {
      const n = Number(budgetText.replace(",", ".").replace(/[^\d.]/g, ""));
      set({ budget_eur: n > 0 ? Math.min(n, 1000) : null });
    }
    if (last) {
      const n = Number(budgetText.replace(",", ".").replace(/[^\d.]/g, ""));
      onDone({ ...prefs, budget_eur: n > 0 ? Math.min(n, 1000) : null });
    } else {
      setStep(step + 1);
    }
  }

  function toggle<T extends string>(list: T[], value: T, max = Infinity): T[] {
    if (list.includes(value)) return list.filter((v) => v !== value);
    return list.length >= max ? list : [...list, value];
  }

  return (
    <section className="card overflow-hidden p-0" aria-labelledby="q-title">
      <div className="flex items-center gap-3 px-4 pt-4">
        <button
          onClick={() => (step === 0 ? onCancel?.() : setStep(step - 1))}
          aria-label={step === 0 ? "Fermer le questionnaire" : "Question précédente"}
          disabled={step === 0 && !onCancel}
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface-container text-on-surface active:scale-90 disabled:invisible"
        >
          <Icon name={step === 0 ? "close" : "arrow_back"} className="text-[18px]" />
        </button>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container"
          role="progressbar"
          aria-label="Progression du questionnaire"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <span className="w-10 text-right text-micro text-on-surface-variant">
          {step + 1}/{STEPS.length}
        </span>
      </div>

      {/* key={step} restarts the entrance animation on every question. */}
      <div key={step} className="animate-q-in px-4 pb-4 pt-5">
        {current === "goal" && (
          <>
            <Title>Qu&apos;est-ce qui vous amène ?</Title>
            <div className="mt-4 space-y-2" role="radiogroup" aria-labelledby="q-title">
              {GOALS.map((g) => (
                <Option
                  key={g.value}
                  role="radio"
                  selected={prefs.goal === g.value}
                  onClick={() => set({ goal: prefs.goal === g.value ? null : g.value })}
                  icon={g.icon}
                  label={g.label}
                  wide
                />
              ))}
            </div>
          </>
        )}

        {current === "servings" && (
          <>
            <Title>Vous êtes combien à table ?</Title>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Un enfant compte pour une demi-portion. Un ado qui mange comme un adulte compte en adulte.
            </p>
            <p className="mt-5 text-center text-label-lg text-on-surface">Adultes</p>
            <div className="mt-1 flex items-center justify-center gap-6">
              <Stepper
                label="Un adulte de moins"
                icon="remove"
                disabled={prefs.servings <= 1}
                onClick={() => set({ servings: prefs.servings - 1 })}
              />
              <p className="w-24 text-center" aria-live="polite">
                <span className="block text-[56px] font-bold leading-none text-on-surface">
                  {prefs.servings}
                </span>
                <span className="text-body-md text-on-surface-variant">
                  adulte{prefs.servings > 1 ? "s" : ""}
                </span>
              </p>
              <Stepper
                label="Un adulte de plus"
                icon="add"
                disabled={prefs.servings >= 12}
                onClick={() => set({ servings: prefs.servings + 1 })}
              />
            </div>
            <p className="mt-4 text-center text-label-lg text-on-surface">Enfants</p>
            <div className="mt-1 flex items-center justify-center gap-6">
              <Stepper
                label="Un enfant de moins"
                icon="remove"
                disabled={(prefs.children ?? 0) <= 0}
                onClick={() => set({ children: (prefs.children ?? 0) - 1 })}
              />
              <p className="w-24 text-center" aria-live="polite">
                <span className="block text-[44px] font-bold leading-none text-on-surface">{prefs.children ?? 0}</span>
                <span className="text-body-md text-on-surface-variant">
                  enfant{(prefs.children ?? 0) > 1 ? "s" : ""}
                </span>
              </p>
              <Stepper
                label="Un enfant de plus"
                icon="add"
                disabled={(prefs.children ?? 0) >= 8}
                onClick={() => set({ children: (prefs.children ?? 0) + 1 })}
              />
            </div>
          </>
        )}

        {current === "meals" && (
          <>
            <Title>Quels repas on prépare ?</Title>
            <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="q-title">
              <Option
                role="radio"
                selected={prefs.meals_per_day === 1}
                onClick={() => set({ meals_per_day: 1 })}
                icon="dark_mode"
                label="Les dîners"
                hint="7 repas"
              />
              <Option
                role="radio"
                selected={prefs.meals_per_day === 2}
                onClick={() => set({ meals_per_day: 2 })}
                icon="light_mode"
                label="Midi et soir"
                hint="14 repas"
              />
            </div>
            <p className="mt-5 text-label-lg text-on-surface">Combien de jours vous cuisinez ?</p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Jours de cuisine">
              {[3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  role="radio"
                  aria-checked={(prefs.days ?? 7) === d}
                  onClick={() => set({ days: d })}
                  className={`grid h-12 w-12 place-items-center rounded-full border-2 text-label-lg ${
                    (prefs.days ?? 7) === d
                      ? "border-primary-container bg-primary-container text-on-primary-container"
                      : "border-outline-variant bg-surface-container-lowest text-on-surface"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </>
        )}

        {current === "budget" && (
          <>
            <Title>Votre budget pour la semaine ?</Title>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Les repas et la liste tiendront dedans. Comptez environ 3 € par personne et par repas.
            </p>
            <button
              onClick={() => setBudgetText(String(suggestedBudget(prefs)))}
              className="mt-4 flex min-h-11 w-full items-center justify-between rounded-2xl bg-primary-container/30 px-4 py-3 text-left text-body-md text-on-surface"
            >
              <span>
                {prefs.servings} pers. × 7 {prefs.meals_per_day === 2 ? "jours, midi et soir" : "dîners"} × 3 €
              </span>
              <b className="tabular-nums">{suggestedBudget(prefs)} €</b>
            </button>
            <label className="mt-5 flex items-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary">
              <span className="sr-only">Budget en euros</span>
              <input
                type="text"
                inputMode="decimal"
                value={budgetText}
                onChange={(e) => setBudgetText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && next()}
                placeholder="60"
                // The frame carries the focus ring, so the field does not draw a second one inside it.
                className="min-w-0 flex-1 bg-transparent text-headline-md text-on-surface outline-none placeholder:text-on-surface-variant focus-visible:outline-none"
              />
              <span className="text-headline-md text-on-surface-variant">€</span>
            </label>
            <button
              onClick={() => {
                setBudgetText("");
                set({ budget_eur: null });
                setStep(step + 1);
              }}
              className="mt-3 w-full rounded-xl py-2 text-label-md text-primary"
            >
              Pas de budget
            </button>
          </>
        )}

        {current === "equipment" && (
          <>
            <Title>Qu&apos;avez-vous en cuisine ?</Title>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Aucune recette ne demandera autre chose.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {EQUIPMENT.map((e) => (
                <Option
                  key={e.value}
                  role="checkbox"
                  selected={prefs.equipment.includes(e.value)}
                  onClick={() => set({ equipment: toggle(prefs.equipment, e.value) })}
                  icon={e.icon}
                  label={e.label}
                />
              ))}
            </div>
          </>
        )}

        {current === "dislikes" && (
          <>
            <Title>Des aliments que vous n&apos;aimez pas ?</Title>
            <p className="mt-1 text-body-md text-on-surface-variant">Promis, je ne vous en proposerai jamais.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {DISLIKES.map((d) => {
                const on = (prefs.dislikes ?? []).includes(d);
                return (
                  <button
                    key={d}
                    aria-pressed={on}
                    onClick={() => set({ dislikes: toggle(prefs.dislikes ?? [], d) })}
                    className={`min-h-11 rounded-full border-2 px-4 text-label-lg ${
                      on
                        ? "border-primary-container bg-primary-container text-on-primary-container"
                        : "border-outline-variant bg-surface-container-lowest text-on-surface"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                set({ dislikes: [] });
                setStep(step + 1);
              }}
              className="mt-3 w-full rounded-xl py-2 text-label-md text-primary"
            >
              Rien de tout ça
            </button>
          </>
        )}

        {current === "time" && (
          <>
            <Title>Combien de temps en cuisine, un soir de semaine ?</Title>
            <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="q-title">
              {TIMES.map((t) => (
                <button
                  key={t.label}
                  role="radio"
                  aria-checked={(prefs.max_minutes ?? null) === t.value}
                  onClick={() => set({ max_minutes: t.value })}
                  className={`min-h-11 rounded-full border-2 px-4 text-label-lg ${
                    (prefs.max_minutes ?? null) === t.value
                      ? "border-primary-container bg-primary-container text-on-primary-container"
                      : "border-outline-variant bg-surface-container-lowest text-on-surface"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-5 text-label-lg text-on-surface">Votre niveau en cuisine ?</p>
            <div className="mt-2 grid grid-cols-1 gap-2" role="radiogroup" aria-label="Niveau en cuisine">
              {LEVELS.map((l) => (
                <Option
                  key={l.value}
                  role="radio"
                  selected={prefs.level === l.value}
                  onClick={() => set({ level: prefs.level === l.value ? null : l.value })}
                  icon={l.icon}
                  label={l.label}
                  hint={l.hint}
                />
              ))}
            </div>
          </>
        )}

        {current === "store" && (
          <>
            <Title>Où faites-vous vos courses ?</Title>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Le budget sera tenu aux prix de ce magasin.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[...CHAINS, "Peu importe"].map((c) => {
                const value = c === "Peu importe" ? null : c;
                const on = (prefs.store ?? null) === value;
                return (
                  <button
                    key={c}
                    onClick={() => set({ store: value })}
                    aria-pressed={on}
                    className={`min-h-11 rounded-full border-2 px-4 text-label-lg ${
                      on
                        ? "border-primary-container bg-primary-container text-on-primary-container"
                        : "border-outline-variant bg-surface-container-lowest text-on-surface"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {current === "styles" && (
          <>
            <Title>Quel genre de repas ?</Title>
            <p className="mt-1 text-body-md text-on-surface-variant">
              De 1 à {MAX_STYLES} choix
              {prefs.styles.length > 0 ? ` · ${prefs.styles.length} choisi${prefs.styles.length > 1 ? "s" : ""}` : ""}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STYLES.map((s) => {
                const selected = prefs.styles.includes(s.value);
                return (
                  <Option
                    key={s.value}
                    role="checkbox"
                    selected={selected}
                    disabled={!selected && prefs.styles.length >= MAX_STYLES}
                    onClick={() => set({ styles: toggle(prefs.styles, s.value, MAX_STYLES) })}
                    icon={s.icon}
                    label={s.label}
                  />
                );
              })}
            </div>
            {allergens.length > 0 && (
              <p className="mt-4 text-micro text-on-surface-variant">
                <Icon name="shield" className="mr-1 align-[-3px] text-[14px] text-primary" />
                Vos allergènes ({allergens.join(", ")}) seront exclus de tous les repas.
              </p>
            )}
          </>
        )}

        <button
          onClick={next}
          disabled={!canContinue || saving}
          className="btn-primary mt-6 w-full py-3 disabled:opacity-50"
        >
          {last ? (
            <>
              <Icon name="restaurant_menu" className="text-[18px]" />
              {saving ? "Enregistrement…" : doneLabel}
            </>
          ) : (
            <>
              {current === "goal" && !prefs.goal ? "Passer" : "Suivant"}
              <Icon name="arrow_forward" className="text-[18px]" />
            </>
          )}
        </button>
      </div>
    </section>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 id="q-title" className="text-headline-md text-on-surface">
      {children}
    </h2>
  );
}

function Option({
  role,
  selected,
  disabled = false,
  onClick,
  icon,
  label,
  hint,
  wide = false,
}: {
  role: "radio" | "checkbox";
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <button
      role={role}
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors duration-150 active:scale-[0.98] disabled:opacity-40 ${
        wide ? "" : "min-h-[88px] flex-col justify-center text-center"
      } ${
        selected
          ? "border-primary bg-primary-container text-on-primary-container"
          : "border-outline-variant bg-surface-container-lowest text-on-surface"
      }`}
    >
      <Icon name={icon} fill={selected} className="text-[26px]" />
      <span className={wide ? "flex-1 text-label-lg" : "text-label-md"}>
        {label}
        {hint && <span className="block text-micro opacity-80">{hint}</span>}
      </span>
      {selected && (
        <Icon
          name="check_circle"
          fill
          className={`text-[20px] ${wide ? "" : "absolute right-2 top-2"}`}
        />
      )}
    </button>
  );
}

function Stepper({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-14 w-14 place-items-center rounded-full bg-surface-container text-on-surface active:scale-90 disabled:opacity-40"
    >
      <Icon name={icon} className="text-[28px]" />
    </button>
  );
}
