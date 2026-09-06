import { describe, expect, it } from "vitest";

import { isLooseProduce, produceEmoji } from "./produce";

describe("produits vendus au poids", () => {
  it("reconnaît une entrée au poids", () => {
    expect(isLooseProduce("fl:potatoes")).toBe(true);
    expect(isLooseProduce("3176582016306")).toBe(false);
    expect(isLooseProduce(null)).toBe(false);
    expect(isLooseProduce(undefined)).toBe(false);
  });

  it("ne remplace jamais la photo d'un produit à code-barres", () => {
    expect(produceEmoji("3176582016306")).toBeNull();
    expect(produceEmoji(null)).toBeNull();
  });

  it("donne la vignette exacte quand la catégorie est connue", () => {
    expect(produceEmoji("fl:potatoes")).toBe("🥔");
    expect(produceEmoji("fl:carrots")).toBe("🥕");
    expect(produceEmoji("fl:garlic")).toBe("🧄");
  });

  it("retombe sur la fin du slug pour les variantes", () => {
    // C'est ce qui évite d'écrire les cent catégories à la main.
    expect(produceEmoji("fl:yellow-onions")).toBe("🧅");
    expect(produceEmoji("fl:red-onions")).toBe("🧅");
    expect(produceEmoji("fl:gala-apples")).toBe("🍎");
    expect(produceEmoji("fl:green-beans")).toBe("🫘");
  });

  it("préfère la correspondance la plus longue", () => {
    // "sweet-potatoes" ne doit pas devenir une pomme de terre ordinaire.
    expect(produceEmoji("fl:sweet-potatoes")).toBe("🍠");
    expect(produceEmoji("fl:potatoes")).toBe("🥔");
  });

  it("ne rend jamais une case vide pour une catégorie inconnue", () => {
    expect(produceEmoji("fl:categorie-jamais-vue")).toBe("🥬");
  });
});
