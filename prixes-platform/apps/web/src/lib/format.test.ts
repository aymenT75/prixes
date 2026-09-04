import { describe, expect, it } from "vitest";

import { nutrient, nutrientParts, priceGapTemperature, priceConfidence } from "./format";

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

describe("nutrient", () => {
  it("prints energy as a whole number", () => {
    expect(nutrient(539, "kcal")).toBe("539 kcal");
    expect(nutrient(538.958, "kcal")).toBe("539 kcal");
  });

  it("keeps one decimal on gram values, without a trailing zero", () => {
    expect(nutrient(6.3, "g")).toBe("6,3 g");
    expect(nutrient(12, "g")).toBe("12 g");
  });

  it("keeps a declared zero — a sugar-free product must read 0, not blank", () => {
    expect(nutrient(0, "g")).toBe("0 g");
  });

  it("returns null when the value is absent, so the row can be omitted", () => {
    expect(nutrient(null, "g")).toBeNull();
    expect(nutrient(undefined, "g")).toBeNull();
  });

  it("rejects non-finite values rather than printing NaN", () => {
    expect(nutrient(Number.NaN, "g")).toBeNull();
    expect(nutrient(Number.POSITIVE_INFINITY, "kcal")).toBeNull();
  });

  it("drops decimals once the value reaches 100", () => {
    expect(nutrient(56.3, "g")).toBe("56,3 g");
    expect(nutrient(100, "g")).toBe("100 g");
  });

  it("formats a percentage with the French spacing", () => {
    expect(nutrient(13, "%")).toBe("13 %");
  });
});

describe("nutrientParts", () => {
  it("splits the number from its unit so a tile can size them differently", () => {
    expect(nutrientParts(539, "kcal")).toEqual({ value: "539", unit: "kcal" });
    expect(nutrientParts(6.3, "g")).toEqual({ value: "6,3", unit: "g" });
  });

  it("returns null on an absent value, like nutrient()", () => {
    expect(nutrientParts(null, "g")).toBeNull();
    expect(nutrientParts(Number.NaN, "g")).toBeNull();
  });

  it("stays consistent with nutrient()", () => {
    const parts = nutrientParts(56.3, "g")!;
    expect(`${parts.value} ${parts.unit}`).toBe(nutrient(56.3, "g"));
  });
});
