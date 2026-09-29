import { describe, expect, it } from "vitest";

import { dropsSentence, spokenCut } from "./news";

const drop = (name: string, old: string, now: string) => ({ barcode: name, name, old, new: now, at: "2026-09-29T10:00:00Z" });

describe("news", () => {
  it("says a cut the way people say it", () => {
    expect(spokenCut(0.4)).toBe("40 centimes");
    expect(spokenCut(1.2)).toBe("1,20 €");
  });

  it("says one drop, or groups several", () => {
    expect(dropsSentence([])).toBeNull();
    expect(dropsSentence([drop("Citrons", "1.05", "0.65")])).toBe(
      "Bonne nouvelle sur votre liste : Citrons, moins 40 centimes, maintenant 0,65 €.",
    );
    const many = ["A", "B", "C", "D"].map((n) => drop(n, "2.00", "1.50"));
    expect(dropsSentence(many)).toMatch(/^4 produits de votre liste ont baissé : A, .* Et 1 autre\.$/);
  });
});
