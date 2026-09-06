import { describe, expect, it } from "vitest";

import { distance, perUnit, priceConfidence, priceGapTemperature } from "./format";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

describe("priceConfidence", () => {
  it("rates a recent official reading as high confidence", () => {
    const c = priceConfidence("op", daysAgo(5));
    expect(c.confidence).toBe("high");
    expect(c.sourceLabel).toBe("Prix relevé");
  });

  it("labels a community contribution as such, at medium confidence when recent", () => {
    const c = priceConfidence("user", daysAgo(5));
    expect(c.sourceLabel).toBe("Communauté");
    expect(c.confidence).toBe("medium");
  });

  it("downgrades an official but aging reading to medium", () => {
    expect(priceConfidence("op", daysAgo(45)).confidence).toBe("medium");
  });

  it("rates anything older than 90 days as low, whatever the source", () => {
    expect(priceConfidence("op", daysAgo(120)).confidence).toBe("low");
    expect(priceConfidence("user", daysAgo(120)).confidence).toBe("low");
  });

  it("treats OpenFoodFacts (off) the same as Open Prices (op)", () => {
    expect(priceConfidence("off", daysAgo(5)).sourceLabel).toBe("Prix relevé");
  });
});

describe("priceGapTemperature", () => {
  it("rates a small discount as cold", () => {
    expect(priceGapTemperature(5).temperature).toBe("cold");
    expect(priceGapTemperature(14).temperature).toBe("cold");
  });

  it("rates a moderate discount as warm, inclusive of the boundary", () => {
    expect(priceGapTemperature(15).temperature).toBe("warm");
    expect(priceGapTemperature(29).temperature).toBe("warm");
  });

  it("rates a big discount as hot, inclusive of the boundary", () => {
    expect(priceGapTemperature(30).temperature).toBe("hot");
    expect(priceGapTemperature(70).temperature).toBe("hot");
  });
});

describe("prix à l'unité", () => {
  it("ne double pas le symbole euro", () => {
    // Le libellé du serveur porte déjà la devise : « 4,45 € €/L » s'affichait
    // sur quatre écrans.
    expect(perUnit(4.45, "€/L")).toBe("4,45 €/L");
    expect(perUnit(1, "€/kg")).toBe("1,00 €/kg");
    expect(perUnit(0.5, "€/pièce")).toBe("0,50 €/pièce");
  });

  it("reste lisible sans libellé", () => {
    expect(perUnit(2.5, null)).toBe("2,50 €");
  });
});

describe("distance", () => {
  it("compte en mètres sous le kilomètre", () => {
    expect(distance(0.45)).toBe("450 m");
    expect(distance(0.12)).toBe("100 m");
    expect(distance(0.98)).toBe("1000 m");
  });

  it("ne prétend pas viser la porte d'entrée", () => {
    // Un point GPS n'est pas précis à dix mètres près.
    expect(distance(0.001)).toBe("50 m");
    expect(distance(0.44)).toBe("450 m");
  });

  it("passe aux kilomètres au-delà", () => {
    expect(distance(1)).toBe("1,0 km");
    expect(distance(3.24)).toBe("3,2 km");
  });
});
