import { Icon } from "@/components/Icon";
import { nutrient, nutrientParts } from "@/lib/format";
import type { Product } from "@/lib/types";

// The four a shopper actually asks for, given the top billing. The rest stay
// available underneath rather than competing with them for attention.
const PRIMARY = [
  { key: "energy_kcal_100g", label: "Énergie", unit: "kcal" },
  { key: "proteins_100g", label: "Protéines", unit: "g" },
  { key: "carbohydrates_100g", label: "Glucides", unit: "g" },
  { key: "sugars_100g", label: "dont sucres", unit: "g" },
] as const;

const SECONDARY = [
  { key: "fiber_100g", label: "Fibres", unit: "g" },
  { key: "fat_100g", label: "Lipides", unit: "g" },
  { key: "saturated_fat_100g", label: "dont acides gras saturés", unit: "g" },
  { key: "salt_100g", label: "Sel", unit: "g" },
  { key: "fruits_vegetables_nuts_100g", label: "Fruits, légumes et fruits à coque", unit: "%" },
] as const;

type Tile = { label: string; value: string; unit: string };
type Row = { label: string; value: string };

function tiles(product: Product): Tile[] {
  const out: Tile[] = [];
  for (const { key, label, unit } of PRIMARY) {
    const parts = nutrientParts(product[key] as number | null, unit);
    if (parts !== null) out.push({ label, ...parts });
  }
  return out;
}

function rows(product: Product): Row[] {
  const out: Row[] = [];
  for (const { key, label, unit } of SECONDARY) {
    const value = nutrient(product[key] as number | null, unit);
    if (value !== null) out.push({ label, value });
  }
  return out;
}

/**
 * Nutrition panel for a scanned product — a handful of headline numbers, so a
 * row of stat tiles rather than a chart.
 *
 * Deliberately carries no judgement (no "too sweet" colouring): what counts as
 * too much sugar depends on the person, and a generic threshold shown now would
 * contradict the personalised score later. This states the facts; the coach
 * interprets them.
 */
export function NutritionFacts({ product }: { product: Product }) {
  const primary = tiles(product);
  const secondary = rows(product);
  const hasAny = primary.length > 0 || secondary.length > 0;

  return (
    <section className="card mb-6 p-4" aria-label="Valeurs nutritionnelles" data-speak>
      <div className="mb-1 flex items-center gap-2">
        <Icon name="nutrition" className="text-primary" />
        <h3 className="text-headline-md text-on-surface">Valeurs nutritionnelles</h3>
      </div>

      {hasAny && (
        <p className="mb-3 text-body-md text-on-surface-variant">
          Pour 100 g
          {product.serving_size ? ` — portion indiquée : ${product.serving_size}` : ""}
        </p>
      )}

      {!hasAny ? (
        <p className="text-body-md text-on-surface-variant">
          Valeurs nutritionnelles non renseignées pour ce produit.
        </p>
      ) : (
        <>
          {primary.length > 0 && (
            // Two columns: verified to stay inside the card at every text scale
            // the app offers, up to the 138 % low-vision setting.
            <dl className="grid grid-cols-2 gap-2">
              {primary.map((row) => (
                <div key={row.label} className="rounded-xl bg-surface-container-high p-3">
                  <dt className="text-micro uppercase tracking-wider text-on-surface-variant">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 text-headline-lg text-on-surface">
                    {row.value}
                    <span className="ml-1 text-label-md text-on-surface-variant">{row.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {secondary.length > 0 && (
            <dl className="mt-3 divide-y divide-outline-variant/20">
              {secondary.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-body-md text-on-surface-variant">{row.label}</dt>
                  {/* Tabular figures only here: these values align in a column. */}
                  <dd className="whitespace-nowrap text-label-lg tabular-nums text-on-surface">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}

      <p className="mt-3 text-micro text-on-surface-variant">
        Source OpenFoodFacts. En cas de doute, vérifiez l&apos;emballage.
      </p>
    </section>
  );
}
