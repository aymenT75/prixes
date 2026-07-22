"use client";

import { useState } from "react";

import { Icon } from "@/components/Icon";
import { ecoHint, novaColor, novaHint, nutriHint, scoreColor } from "@/lib/format";
import { useDialog } from "@/lib/useDialog";

const GRADES = ["a", "b", "c", "d", "e"] as const;
const NOVA_GROUPS = [1, 2, 3, 4] as const;

function Swatch({ color, label, hint }: { color: string; label: string; hint: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-label-md font-bold text-white"
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {label}
      </span>
      <span className="text-body-md text-on-surface-variant">{hint}</span>
    </li>
  );
}

// Explains the colour-coding a shopper sees everywhere in the app (the whole
// product card tinted by Nutri-Score, plus the Nutri/Eco/NOVA badges) — never
// documented on-screen before, only spoken as an accessibility hint per
// product. One shared trigger + modal, dropped wherever coloured product
// cards appear (Home, Courses).
export function ScoreLegend({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useDialog(open, () => setOpen(false));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Pourquoi les produits sont-ils en couleur ? Voir la légende"
        className={
          compact
            ? "grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-surface-container-high text-on-surface-variant active:scale-90"
            : "flex items-center gap-1 rounded-full bg-surface-container-high px-3 py-1.5 text-label-md text-on-surface-variant active:scale-95"
        }
      >
        <Icon name="info" className="text-[16px]" />
        {!compact && <span>Légende des couleurs</span>}
      </button>

      {open && (
        <div
          ref={ref}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Légende des couleurs"
          className="fixed inset-0 z-[60] grid place-items-end bg-black/40 backdrop-blur-sm outline-none sm:place-items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface-container-lowest p-6 pb-10 shadow-float sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-headline-md text-on-surface">Pourquoi ces couleurs ?</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high"
              >
                <Icon name="close" />
              </button>
            </div>

            {/* Why the colours exist at all. The sections below say what each grade
                means; without this, a shopper knows the code but not the point of it. */}
            <p className="mb-5 rounded-xl bg-surface-container-high p-3 text-body-md text-on-surface">
              Comparer des prix ne dit rien de ce qu&apos;on achète. Ces couleurs vous
              donnent, d&apos;un seul coup d&apos;œil et sans lire une étiquette, la qualité
              nutritionnelle, l&apos;impact sur l&apos;environnement et le degré de
              transformation — pour que le produit le moins cher ne soit pas un mauvais choix
              sans que vous le sachiez.
            </p>

            <section className="mb-5">
              <h3 className="mb-1 text-label-lg font-semibold text-on-surface">
                Nutri-Score — fond de la fiche produit
              </h3>
              <p className="mb-3 text-body-md text-on-surface-variant">
                La couleur de fond de chaque produit reflète sa qualité nutritionnelle, du vert
                (bonne) au rouge (faible).
              </p>
              <ul className="space-y-2">
                {GRADES.map((g) => (
                  <Swatch key={g} color={scoreColor[g]} label={g.toUpperCase()} hint={nutriHint[g]} />
                ))}
              </ul>
            </section>

            <section className="mb-5">
              <h3 className="mb-1 text-label-lg font-semibold text-on-surface">
                Eco-Score — badge &laquo;&nbsp;Eco&nbsp;&raquo;
              </h3>
              <p className="mb-3 text-body-md text-on-surface-variant">
                Même échelle de lettres, mais pour l&apos;impact environnemental du produit.
              </p>
              <ul className="space-y-2">
                {GRADES.map((g) => (
                  <Swatch key={g} color={scoreColor[g]} label={g.toUpperCase()} hint={ecoHint[g]} />
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-1 text-label-lg font-semibold text-on-surface">
                NOVA — badge &laquo;&nbsp;NOVA&nbsp;&raquo;
              </h3>
              <p className="mb-3 text-body-md text-on-surface-variant">
                Le degré de transformation de l&apos;aliment, de 1 (brut) à 4 (ultra-transformé).
              </p>
              <ul className="space-y-2">
                {NOVA_GROUPS.map((n) => (
                  <Swatch key={n} color={novaColor[n]} label={String(n)} hint={novaHint[n]} />
                ))}
              </ul>
            </section>

            <p className="mt-5 text-micro text-on-surface-variant">
              Source OpenFoodFacts. Ces indications ne remplacent jamais l&apos;étiquette du
              produit.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
