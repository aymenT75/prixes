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
