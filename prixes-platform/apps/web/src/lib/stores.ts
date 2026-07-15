// Shared "nearest branch" matching — used by the store map and, automatically,
// by the product detail page (no tap required to see where to buy something).
import type { Store } from "./types";

// Normalise for loose brand matching: lowercase, strip accents + punctuation.
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Pick the nearest store (already distance-sorted) whose name/brand shares a
// significant token with the searched store name; fall back to the closest of all.
export function pickBranch(stores: Store[], wanted: string): Store | null {
  if (stores.length === 0) return null;
  const wantTokens = new Set(norm(wanted).split(" ").filter((t) => t.length >= 3));
  if (wantTokens.size > 0) {
    const match = stores.find((s) => {
      const hay = new Set(norm(`${s.name} ${s.brand ?? ""}`).split(" "));
      return [...wantTokens].some((t) => hay.has(t));
    });
    if (match) return match;
  }
  return stores[0];
}
