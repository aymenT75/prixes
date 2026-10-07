import { describe, expect, it } from "vitest";

import { adviceReason, byAisle, rankStores } from "./courses";

const shops = [
  { store: "Lidl", total: 61.8, km: 0.45, items: 20 },
  { store: "Carrefour City", total: 74.1, km: 0.2, items: 20 },
  { store: "Leclerc", total: 58.9, km: 2.4, items: 20 },
  { store: "Épicerie", total: 12, km: 0.1, items: 3 },
];

describe("rankStores", () => {
  it("puts the cheapest first when price counts", () => {
    expect(rankStores(shops, 0, null)[0].store).toBe("Leclerc");
  });
  it("puts the nearest well-stocked shop first when distance counts", () => {
    expect(rankStores(shops, 100, null)[0].store).toBe("Carrefour City");
  });
  it("never advises a shop that sells a fraction of the list", () => {
    expect(rankStores(shops, 100, null)[0].store).not.toBe("Épicerie");
  });
  it("sinks shops over budget", () => {
    expect(rankStores(shops, 100, 70)[0].store).not.toBe("Carrefour City");
  });
  it("explains the advice", () => {
    const leclerc = shops[2];
    expect(adviceReason(leclerc, shops)).toBe("le moins cher");
  });
});

describe("byAisle", () => {
  it("orders aisles as one walks the shop", () => {
    const line = (label: string, aisle: string) => ({ barcode: label, label, quantity: 1, unit_price: 1, line_total: 1, aisle });
    const groups = byAisle([line("Eau", "Boissons"), line("Pommes", "Fruits et légumes"), line("Lait", "Frais")]);
    expect(groups.map((g) => g.aisle)).toEqual(["Fruits et légumes", "Frais", "Boissons"]);
  });
});
