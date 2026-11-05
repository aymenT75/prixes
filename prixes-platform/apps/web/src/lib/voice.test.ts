import { describe, expect, it } from "vitest";

import { parseIntent } from "./voice";

describe("parseIntent", () => {
  it("returns unknown for empty/unheard input", () => {
    expect(parseIntent("").type).toBe("unknown");
  });

  it("recognises a help request", () => {
    expect(parseIntent("aide").type).toBe("help");
  });

  it("recognises dark/light mode requests", () => {
    expect(parseIntent("mode sombre")).toMatchObject({ type: "setting", action: "dark" });
    expect(parseIntent("mode clair")).toMatchObject({ type: "setting", action: "light" });
  });

  it("recognises the exact example command shown in the voice assistant UI", () => {
    // Regression test: \b(agrandi)\b alone doesn't match "agrandis" (the "tu"
    // imperative form) because "s" immediately follows with no word boundary —
    // this phrase used to silently fall through to a literal product search.
    expect(parseIntent("Agrandis le texte")).toMatchObject({ type: "setting", action: "bigger" });
  });

  it("recognises other phrasings for bigger/smaller text", () => {
    expect(parseIntent("plus grand")).toMatchObject({ type: "setting", action: "bigger" });
    expect(parseIntent("réduis le texte")).toMatchObject({ type: "setting", action: "smaller" });
    expect(parseIntent("plus petit")).toMatchObject({ type: "setting", action: "smaller" });
  });

  it("recognises a contrast request", () => {
    expect(parseIntent("active le contraste")).toMatchObject({ type: "setting", action: "contrast" });
  });

  it("parses a search command and strips the leading article", () => {
    const intent = parseIntent("cherche du lait");
    expect(intent).toMatchObject({ type: "search", query: "lait" });
  });

  it("parses a search command with no leading article", () => {
    const intent = parseIntent("trouve nutella");
    expect(intent).toMatchObject({ type: "search", query: "nutella" });
  });

  it("navigates to a known screen by keyword", () => {
    expect(parseIntent("ouvre ma liste")).toMatchObject({ type: "navigate", path: "/list" });
    expect(parseIntent("ma liste de courses")).toMatchObject({ type: "navigate", path: "/list" });
    expect(parseIntent("va sur l'accueil")).toMatchObject({ type: "navigate", path: "/" });
    expect(parseIntent("où aller")).toMatchObject({ type: "navigate", path: "/ou-aller" });
    expect(parseIntent("où faire mes courses")).toMatchObject({ type: "navigate", path: "/ou-aller" });
    expect(parseIntent("quel est le magasin le moins cher")).toMatchObject({ type: "navigate", path: "/ou-aller" });
    expect(parseIntent("mes réglages")).toMatchObject({ type: "navigate", path: "/account" });
  });

  it("says plainly what the app no longer does, rather than searching a product", () => {
    for (const t of [
      "essence la moins chère",
      "compose mon menu de la semaine",
      "scanne un produit",
      "alerte sur le café",
      "je veux m'abonner à Premium",
    ]) {
      expect(parseIntent(t)).toMatchObject({ type: "unknown" });
    }
  });

  it("falls back to treating the whole phrase as a search", () => {
    const intent = parseIntent("nutella 750g");
    expect(intent).toMatchObject({ type: "search", query: "nutella 750g" });
  });

  it("adds to and reads the shopping list", () => {
    expect(parseIntent("ajoute du lait à ma liste")).toMatchObject({ type: "list-add", query: "lait" });
    expect(parseIntent("rajoute des œufs")).toMatchObject({ type: "list-add" });
    expect(parseIntent("lis ma liste")).toMatchObject({ type: "list-read" });
    expect(parseIntent("qu'est-ce qu'il y a dans ma liste")).toMatchObject({ type: "list-read" });
  });

  it("removes from the shopping list", () => {
    expect(parseIntent("enlève le lait de ma liste")).toMatchObject({ type: "list-remove", query: "lait" });
    expect(parseIntent("retire les œufs")).toMatchObject({ type: "list-remove" });
  });

  it("opens the feedback page", () => {
    expect(parseIntent("je veux signaler un problème")).toMatchObject({ type: "navigate", path: "/feedback" });
  });

  it("still searches products for a plain product phrase", () => {
    expect(parseIntent("lait demi-écrémé")).toMatchObject({ type: "search" });
    expect(parseIntent("cherche du beurre")).toMatchObject({ type: "search", query: "beurre" });
  });

  it("never mistakes a product with a colour word for a setting", () => {
    expect(parseIntent("haricots noirs")).toMatchObject({ type: "search" });
    expect(parseIntent("fromage blanc")).toMatchObject({ type: "search" });
  });

  it("answers a question with oui / non", () => {
    for (const t of ["oui", "oui merci", "d'accord", "vas-y", "ajoute-le"]) {
      expect(parseIntent(t)).toMatchObject({ type: "confirm" });
    }
    for (const t of ["non", "non merci", "laisse tomber", "pas maintenant"]) {
      expect(parseIntent(t)).toMatchObject({ type: "cancel" });
    }
    // "oui" only at the start: a product name is still a search.
    expect(parseIntent("noix de cajou")).toMatchObject({ type: "search" });
  });

  it("keeps the pronoun, so the assistant can use the product just talked about", () => {
    expect(parseIntent("ajoute-le à ma liste")).toMatchObject({ type: "list-add", query: "le" });
    expect(parseIntent("ajoute ça à ma liste")).toMatchObject({ type: "list-add", query: "ca" });
  });

  it("ends the conversation on merci / c'est tout, but not on « oui merci »", () => {
    for (const t of ["merci", "c'est tout", "au revoir", "ça ira", "merci beaucoup"]) {
      expect(parseIntent(t)).toMatchObject({ type: "bye" });
    }
    expect(parseIntent("oui merci")).toMatchObject({ type: "confirm" });
    expect(parseIntent("non merci")).toMatchObject({ type: "cancel" });
  });

  it("« guide-moi » opens the in-store guide, even said as « je suis au magasin »", () => {
    expect(parseIntent("guide-moi")).toMatchObject({ type: "guide" });
    expect(parseIntent("je suis au magasin")).toMatchObject({ type: "guide" });
  });
});
