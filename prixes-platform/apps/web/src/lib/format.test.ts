import { describe, expect, it } from "vitest";

import { dealTemperature, priceConfidence } from "./format";

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

describe("dealTemperature", () => {
  it("rates a small discount as cold", () => {
    expect(dealTemperature(5).temperature).toBe("cold");
    expect(dealTemperature(14).temperature).toBe("cold");
  });

  it("rates a moderate discount as warm, inclusive of the boundary", () => {
    expect(dealTemperature(15).temperature).toBe("warm");
    expect(dealTemperature(29).temperature).toBe("warm");
  });

  it("rates a big discount as hot, inclusive of the boundary", () => {
    expect(dealTemperature(30).temperature).toBe("hot");
    expect(dealTemperature(70).temperature).toBe("hot");
  });
});
