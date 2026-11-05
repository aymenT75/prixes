/**
 * The shopping assistant's choices: which shop it advises, and the order of the
 * aisles. Pure functions plus one remembered setting, so the ranking can be
 * tested without a page.
 */

import { create } from "zustand";

import type { BasketItem } from "./types";

/** "Guide-moi" said to the assistant: the Où aller page starts the guide. */
export const useGuideRequest = create<{ asked: boolean }>(() => ({ asked: false }));

// ── Remembered settings (this phone only) ──
const STORE_KEY = "prixes.courses.store";

/** The shop chosen last time, so "guide-moi" knows where you are. */
export function rememberedStore(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

export function rememberStore(store: string): void {
  try {
    localStorage.setItem(STORE_KEY, store);
  } catch {
    /* storage blocked */
  }
}

// ── The advice ──
export interface Candidate {
  store: string;
  total: number;
  km: number;
  /** How many lines of the list this shop sells. */
  items: number;
}

/**
 * Shops best first for a given weight of distance against price.
 *
 * Price and distance are scaled to 0–1 across the shops on offer, then mixed by
 * `priority`. A shop over budget sinks below every shop within it, and a shop
 * that sells fewer of the list's items than the best-stocked one is penalised
 * in proportion: it is not cheaper, it is emptier.
 */
export function rankStores<T extends Candidate>(shops: T[], priority: number, budget: number | null): T[] {
  if (shops.length < 2) return [...shops];
  const w = Math.min(100, Math.max(0, priority)) / 100;
  const prices = shops.map((s) => s.total);
  const kms = shops.map((s) => s.km);
  const most = Math.max(...shops.map((s) => s.items));
  const scale = (v: number, all: number[]) => {
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    return hi > lo ? (v - lo) / (hi - lo) : 0;
  };
  const score = (s: T) =>
    (1 - w) * scale(s.total, prices) +
    w * scale(s.km, kms) +
    // Coverage weighs most: a shop selling 9 of 15 items looks cheaper only
    // because it is emptier (seen with "guide-moi" picking a corner shop).
    (most > 0 ? (3 * (most - s.items)) / most : 0) +
    (budget != null && s.total > budget ? 10 : 0);
  return [...shops].sort((a, b) => score(a) - score(b) || a.total - b.total);
}

// ── Aisles, in the order one walks a French supermarket (same as the API) ──
export const AISLE_ORDER = [
  "Fruits et légumes",
  "Boulangerie",
  "Frais",
  "Boucherie et poissonnerie",
  "Surgelés",
  "Épicerie salée",
  "Épicerie sucrée",
  "Boissons",
  "Hygiène et maison",
  "Autres rayons",
];

export function aisleOf(item: BasketItem): string {
  return item.aisle ?? "Autres rayons";
}

/** The basket split by aisle, aisles in walking order. */
export function byAisle(items: BasketItem[]): { aisle: string; items: BasketItem[] }[] {
  const groups = new Map<string, BasketItem[]>();
  for (const it of items) {
    const a = aisleOf(it);
    groups.set(a, [...(groups.get(a) ?? []), it]);
  }
  const rank = (a: string) => {
    const i = AISLE_ORDER.indexOf(a);
    return i < 0 ? AISLE_ORDER.length : i;
  };
  return [...groups.entries()]
    .sort((x, y) => rank(x[0]) - rank(y[0]))
    .map(([aisle, list]) => ({ aisle, items: list }));
}
