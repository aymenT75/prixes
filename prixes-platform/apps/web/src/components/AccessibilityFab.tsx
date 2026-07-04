"use client";

import { Icon } from "@/components/Icon";
import { ALL_ALLERGENS, ALL_DIETS, useA11y, type FontScale } from "@/lib/useA11y";

const SIZES: { key: FontScale; label: string; cls: string }[] = [
  { key: "normal", label: "A", cls: "text-[16px]" },
  { key: "large", label: "A+", cls: "text-[20px]" },
  { key: "xl", label: "A++", cls: "text-[26px]" },
];

export function AccessibilityFab() {
  const {
    fontScale,
    highContrast,
    dark,
    allergens,
    diets,
    autoRead,
    setFontScale,
    toggleContrast,
    toggleDark,
    toggleAllergen,
    toggleDiet,
    setAutoRead,
    setVoiceOpen,
    a11yOpen: open,
    setA11yOpen: setOpen,
  } = useA11y();

  // The launcher lives in the top header (PageHeader) now; this component only
  // renders the sheet, opened via the shared store.
  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Options d'accessibilité"
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-surface-container-lowest p-6 pb-10 shadow-float sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky so the close button stays reachable even when the sheet
                scrolls (long content + enlarged text can exceed the viewport). */}
            <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-5 flex items-center justify-between bg-surface-container-lowest px-6 pb-3 pt-6">
              <h2 className="flex items-center gap-2 text-headline-md text-on-surface">
                <Icon name="accessibility_new" className="text-primary" /> Accessibilité
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high"
              >
                <Icon name="close" />
              </button>
            </div>

            {/* Voice assistant launcher */}
            <button
              onClick={() => {
                setOpen(false);
                setVoiceOpen(true);
              }}
              className="mb-5 flex w-full items-center gap-3 rounded-2xl bg-primary p-4 text-left text-on-primary shadow-card active:scale-[0.99]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                <Icon name="mic" fill className="text-[26px]" />
              </span>
              <span>
                <span className="block text-label-lg font-bold">Assistant vocal</span>
                <span className="block text-micro opacity-90">
                  Parlez pour chercher, comparer, naviguer
                </span>
              </span>
            </button>

            {/* Text size */}
            <fieldset className="mb-5">
              <legend className="mb-2 text-label-lg text-on-surface-variant">Taille du texte</legend>
              <div className="grid grid-cols-3 gap-2" role="group">
                {SIZES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setFontScale(s.key)}
                    aria-pressed={fontScale === s.key}
                    className={`flex h-16 items-center justify-center rounded-xl border-2 font-bold transition-all ${
                      fontScale === s.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-outline-variant/40 text-on-surface"
                    } ${s.cls}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Toggles */}
            <ToggleRow
              icon="contrast"
              title="Fort contraste"
              subtitle="Couleurs plus marquées, plus lisibles"
              on={highContrast}
              onToggle={toggleContrast}
            />
            <ToggleRow
              icon="dark_mode"
              title="Mode sombre"
              subtitle="Réduit l'éblouissement"
              on={dark}
              onToggle={toggleDark}
            />
            <ToggleRow
              icon="record_voice_over"
              title="Lecture automatique"
              subtitle="Lit la fiche produit à voix haute à l'ouverture"
              on={autoRead}
              onToggle={() => setAutoRead(!autoRead)}
            />

            {/* Allergen profile */}
            <fieldset className="mt-5">
              <legend className="mb-1 flex items-center gap-2 text-label-lg text-on-surface-variant">
                <Icon name="health_and_safety" className="text-primary" /> Mes allergies
              </legend>
              <p className="mb-2 text-micro text-on-surface-variant">
                Sélectionnez vos allergènes : l&apos;app vous alerte (visuel + voix) sur les produits
                concernés.
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_ALLERGENS.map((a) => {
                  const on = allergens.includes(a);
                  return (
                    <button
                      key={a}
                      onClick={() => toggleAllergen(a)}
                      aria-pressed={on}
                      className={`chip text-label-md ${
                        on
                          ? "border-2 border-error bg-error-container font-bold text-on-error-container"
                          : "border border-outline-variant/40 bg-surface-container text-on-surface"
                      }`}
                    >
                      {on && <Icon name="check" className="mr-1 text-[16px]" />}
                      {a}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Dietary regime */}
            <fieldset className="mt-5">
              <legend className="mb-1 flex items-center gap-2 text-label-lg text-on-surface-variant">
                <Icon name="restaurant" className="text-primary" /> Mon régime alimentaire
              </legend>
              <p className="mb-2 text-micro text-on-surface-variant">
                L&apos;app indique si un produit est compatible avec votre régime.
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_DIETS.map((d) => {
                  const on = diets.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDiet(d)}
                      aria-pressed={on}
                      className={`chip text-label-md ${
                        on
                          ? "bg-primary font-bold text-on-primary"
                          : "border border-outline-variant/40 bg-surface-container text-on-surface"
                      }`}
                    >
                      {on && <Icon name="check" className="mr-1 text-[16px]" />}
                      {d}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <p className="mt-5 flex items-start gap-2 rounded-xl bg-primary/5 p-4 text-body-md text-on-surface-variant">
              <Icon name="mic" className="mt-0.5 text-primary" />
              <span>
                Astuce : appuyez sur le bouton micro vert et dites par exemple
                <strong className="text-on-surface"> « cherche du lait »</strong> ou
                <strong className="text-on-surface"> « les bons plans »</strong>.
              </span>
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function ToggleRow({
  icon,
  title,
  subtitle,
  on,
  onToggle,
}: {
  icon: string;
  title: string;
  subtitle: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      aria-label={title}
      className="mb-2 flex w-full items-center justify-between rounded-xl border border-outline-variant/30 p-3 text-left active:scale-[0.99]"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container text-primary">
          <Icon name={icon} />
        </span>
        <span>
          <span className="block text-label-lg text-on-surface">{title}</span>
          <span className="block text-micro text-on-surface-variant">{subtitle}</span>
        </span>
      </span>
      <span
        className={`relative h-7 w-12 rounded-full transition-colors ${on ? "bg-primary" : "bg-surface-variant"}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`}
        />
      </span>
    </button>
  );
}
