import { describe, expect, it } from "vitest";

import { priceConfidence } from "./format";

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
