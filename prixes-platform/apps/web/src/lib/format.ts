export const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export type Confidence = "high" | "medium" | "low";

// How much to trust a displayed price, from its source + age (SIT audit: users
// must be able to tell an official reading from a community one, and a fresh
// price from a stale one). Sources: "op"/"off" = read from Open Prices /
// OpenFoodFacts, "user" = community contribution.
export function priceConfidence(
  source: string,
  createdAt: string,
): { confidence: Confidence; sourceLabel: string; note: string } {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  const community = source === "user";
  const sourceLabel = community ? "Communauté" : "Prix relevé";

  let confidence: Confidence;
  if (ageDays > 90) confidence = "low"; // stale, whatever the source
  else if (!community && ageDays <= 30) confidence = "high";
  else confidence = "medium";

  const note =
    confidence === "high"
      ? "Fiabilité élevée"
      : confidence === "medium"
        ? "Fiabilité moyenne"
        : "Prix ancien — à vérifier";
  return { confidence, sourceLabel, note };
}

export const confidenceColor: Record<Confidence, string> = {
  high: "#0f6e56", // teal-ish green
  medium: "#854f0b", // amber
  low: "#a32d2d", // red
};

export type Temperature = "cold" | "warm" | "hot";

// How interesting a discount actually is, from its percentage — the "deal
// thermometer": froid (not worth it) → tiède → chaud (genuinely worth
// grabbing). Used on deal cards and on a product's own cross-store price
// spread, so it takes a plain discount % rather than a Deal, keeping both
// call sites (DealCard, product detail) free of duplicated thresholds.
export function dealTemperature(discountPct: number): {
  temperature: Temperature;
  label: string;
  icon: string;
} {
  if (discountPct >= 30) return { temperature: "hot", label: "Chaud — bon plan", icon: "local_fire_department" };
  if (discountPct >= 15) return { temperature: "warm", label: "Tiède — correct", icon: "device_thermostat" };
  return { temperature: "cold", label: "Froid — peu intéressant", icon: "ac_unit" };
}

export const temperatureColor: Record<Temperature, string> = {
  hot: "#dc2626", // red
  warm: "#d97706", // amber
  cold: "#2563eb", // blue
};

// Nutri/Eco score colour (a..e), ported from the original badge logic.
export const scoreColor: Record<string, string> = {
  a: "#038141",
  b: "#85bb2f",
  c: "#fecb02",
  d: "#ee8100",
  e: "#e63e11",
};

// Plain-language nutritional hint per Nutri-Score, spoken/announced so the meaning
// conveyed by colour is never colour-only (WCAG 1.4.1).
export const nutriHint: Record<string, string> = {
  a: "bonne qualité nutritionnelle",
  b: "bonne qualité nutritionnelle",
  c: "qualité nutritionnelle moyenne",
  d: "faible qualité nutritionnelle",
  e: "faible qualité nutritionnelle",
};

// Shared "colour the whole bar by Nutri-Score" inline style (border + theme-aware
// tint via color-mix so text contrast stays high). Returns undefined when unknown.
export function nutriBarStyle(grade: string | null | undefined): import("react").CSSProperties | undefined {
  const g = grade?.toLowerCase();
  const c = g ? scoreColor[g] : undefined;
  if (!c) return undefined;
  return {
    borderColor: c,
    borderWidth: 2,
    borderLeftWidth: 6,
    backgroundColor: `color-mix(in srgb, ${c} 10%, rgb(var(--color-surface-container-lowest)))`,
  };
}
