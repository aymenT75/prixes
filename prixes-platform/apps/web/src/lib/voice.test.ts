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
    expect(parseIntent("ouvre les deals")).toMatchObject({ type: "navigate", path: "/deals" });
    expect(parseIntent("ouvre le scanner")).toMatchObject({ type: "navigate", path: "/scanner" });
    expect(parseIntent("ouvre ma liste")).toMatchObject({ type: "navigate", path: "/list" });
    expect(parseIntent("mes alertes")).toMatchObject({ type: "navigate", path: "/alerts" });
    expect(parseIntent("les magasins proches")).toMatchObject({ type: "navigate", path: "/stores" });
    expect(parseIntent("va sur l'accueil")).toMatchObject({ type: "navigate", path: "/" });
  });

  it("routes the shopping list, not Courses, for 'liste de courses'", () => {
    // "liste de courses" contains "course" — the list target must win over /courses.
    expect(parseIntent("ma liste de courses")).toMatchObject({ type: "navigate", path: "/list" });
  });

  it("no longer navigates to the removed fuel screen", () => {
    // The Carburant feature was removed — voice search for fuel words must not
    // route anywhere special anymore, it just becomes a plain product search.
    const intent = parseIntent("trouve une station essence");
    expect(intent.type).not.toBe("navigate");
  });

  it("falls back to treating the whole phrase as a search", () => {
    const intent = parseIntent("nutella 750g");
    expect(intent).toMatchObject({ type: "search", query: "nutella 750g" });
  });
});
