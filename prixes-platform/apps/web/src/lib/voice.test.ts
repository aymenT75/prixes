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
    expect(parseIntent("mes alertes")).toMatchObject({ type: "navigate", path: "/alerts" });
    expect(parseIntent("va sur l'accueil")).toMatchObject({ type: "navigate", path: "/" });
    expect(parseIntent("menu de la semaine")).toMatchObject({ type: "navigate", path: "/menu" });
  });

  it("routes the shopping list, not Courses, for 'liste de courses'", () => {
    // "liste de courses" contains "course" — the list target must win over /courses.
    expect(parseIntent("ma liste de courses")).toMatchObject({ type: "navigate", path: "/list" });
  });

  it("turns a fuel phrase into a fuel search, not a product search", () => {
    // Heard on the tester's phone on 28/09: this went to a product search.
    expect(parseIntent("trouve-moi une station essence pour du 95 s'il te plaît")).toMatchObject({
      type: "task",
      path: "/fuel",
      task: { kind: "fuel", fuel: "sp95" },
    });
    expect(parseIntent("prix du carburant")).toMatchObject({ task: { kind: "fuel", fuel: "gazole" } });
    expect(parseIntent("gazole le moins cher")).toMatchObject({ task: { kind: "fuel", fuel: "gazole" } });
    expect(parseIntent("du sans plomb 98")).toMatchObject({ task: { kind: "fuel", fuel: "sp98" } });
    expect(parseIntent("où trouver de l'E85")).toMatchObject({ task: { kind: "fuel", fuel: "e85" } });
  });

  it("falls back to treating the whole phrase as a search", () => {
    const intent = parseIntent("nutella 750g");
    expect(intent).toMatchObject({ type: "search", query: "nutella 750g" });
  });

  // ── Every feature by voice ────────────────────────────────────────────────
  it("runs the tasks each page does on arrival", () => {
    expect(parseIntent("les magasins proches")).toMatchObject({ type: "task", path: "/stores", task: { kind: "stores" } });
    expect(parseIntent("ouvre le scanner")).toMatchObject({ type: "task", path: "/scanner", task: { kind: "scan" } });
    expect(parseIntent("scanne un produit")).toMatchObject({ task: { kind: "scan" } });
    expect(parseIntent("où faire mes courses")).toMatchObject({ type: "task", path: "/list", task: { kind: "split" } });
    expect(parseIntent("quel est le magasin le moins cher")).toMatchObject({ task: { kind: "split" } });
  });

  it("composes or changes the weekly menu", () => {
    expect(parseIntent("compose mon menu de la semaine")).toMatchObject({ task: { kind: "menu-compose" } });
    expect(parseIntent("qu'est-ce qu'on mange cette semaine")).toMatchObject({ task: { kind: "menu-compose" } });
    expect(parseIntent("change le repas de mardi")).toMatchObject({ task: { kind: "menu-swap", day: 1 } });
    expect(parseIntent("remplace le dîner de dimanche")).toMatchObject({ task: { kind: "menu-swap", day: 6 } });
  });

  it("sends a dish to the shopping assistant", () => {
    expect(parseIntent("une raclette pour 6")).toMatchObject({
      type: "task",
      path: "/list",
      task: { kind: "cart", prompt: "une raclette pour 6" },
    });
    expect(parseIntent("ingrédients pour des lasagnes")).toMatchObject({ task: { kind: "cart" } });
    expect(parseIntent("je fais un couscous ce soir")).toMatchObject({ task: { kind: "cart" } });
  });

  it("adds to and reads the shopping list", () => {
    expect(parseIntent("ajoute du lait à ma liste")).toMatchObject({ type: "list-add", query: "lait" });
    expect(parseIntent("rajoute des œufs")).toMatchObject({ type: "list-add" });
    expect(parseIntent("lis ma liste")).toMatchObject({ type: "list-read" });
    expect(parseIntent("qu'est-ce qu'il y a dans ma liste")).toMatchObject({ type: "list-read" });
  });

  it("creates a price alert", () => {
    expect(parseIntent("alerte sur le café")).toMatchObject({ type: "alert-add", query: "cafe" });
    expect(parseIntent("préviens-moi quand le beurre baisse")).toMatchObject({ type: "alert-add", query: "beurre" });
  });

  it("opens Premium and the feedback page", () => {
    expect(parseIntent("je veux m'abonner à Premium")).toMatchObject({ type: "premium" });
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
});
