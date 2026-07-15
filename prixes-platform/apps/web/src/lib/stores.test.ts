import { describe, expect, it } from "vitest";

import { pickBranch } from "./stores";
import type { Store } from "./types";

function store(overrides: Partial<Store>): Store {
  return {
    id: 1,
    name: "Store",
    brand: null,
    address: null,
    lat: 0,
    lon: 0,
    distance_km: 1,
    ...overrides,
  };
}

describe("pickBranch", () => {
  it("returns null when there are no nearby stores", () => {
    expect(pickBranch([], "Carrefour")).toBeNull();
  });

  it("matches a branch by brand name, ignoring accents/case", () => {
    const stores = [
      store({ id: 1, name: "Franprix", brand: "Franprix", distance_km: 0.2 }),
      store({ id: 2, name: "Carrefour Market", brand: "Carrefour", distance_km: 0.9 }),
    ];
    const branch = pickBranch(stores, "carrefour");
    expect(branch?.id).toBe(2);
  });

  it("matches on the store's own name when brand is missing", () => {
    const stores = [store({ id: 1, name: "E.Leclerc", brand: null })];
    expect(pickBranch(stores, "E.Leclerc")?.id).toBe(1);
  });

  it("falls back to the nearest store when nothing matches the requested chain", () => {
    // Real-world case found in production data: the requested chain ("E.Leclerc")
    // has no branch in the nearby results — the user must still get *a* nearby
    // store rather than a dead end.
    const stores = [
      store({ id: 1, name: "Normal", brand: null, distance_km: 0.15 }),
      store({ id: 2, name: "Franprix", brand: "Franprix", distance_km: 0.22 }),
    ];
    expect(pickBranch(stores, "E.Leclerc")?.id).toBe(1); // closest, first in the (pre-sorted) list
  });

  it("ignores short/generic tokens so they don't cause false matches", () => {
    // "de" and "la" are below the 3-char token threshold and shouldn't match names.
    const stores = [store({ id: 1, name: "La Grande Épicerie", brand: null, distance_km: 5 })];
    const branch = pickBranch(stores, "Carrefour de la Ville");
    // No real token overlap ("carrefour"/"ville" vs "grande"/"epicerie") — falls
    // back to the closest (only) store rather than a spurious match.
    expect(branch?.id).toBe(1);
  });
});
