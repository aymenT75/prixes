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

/**
 * The nearest branch of `wanted`, or null.
 *
 * Strict on purpose: `pickBranch` below falls back to the closest shop of any
 * chain, which is the right answer for "show me where to go" and the wrong one
 * for "how far is the Carrefour" — there, a fallback would print the distance to
 * a different shop entirely.
 */
export function findBranch(stores: Store[], wanted: string): Store | null {
  const wantTokens = new Set(norm(wanted).split(" ").filter((t) => t.length >= 3));
  if (wantTokens.size === 0) return null;
  return (
    stores.find((s) => {
      const hay = new Set(norm(`${s.name} ${s.brand ?? ""}`).split(" "));
      return [...wantTokens].some((t) => hay.has(t));
    }) ?? null
  );
}

// Pick the nearest store (already distance-sorted) whose name/brand shares a
// significant token with the searched store name; fall back to the closest of all.
export function pickBranch(stores: Store[], wanted: string): Store | null {
  if (stores.length === 0) return null;
  return findBranch(stores, wanted) ?? stores[0];
}
