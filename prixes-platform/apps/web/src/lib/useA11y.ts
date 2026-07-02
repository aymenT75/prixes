// Accessibility settings (shared store) — font scaling, high contrast, dark mode.
// Designed for low-vision and elderly users; the voice assistant also drives this.
import { create } from "zustand";

export type FontScale = "normal" | "large" | "xl";

// The 14 EU-regulated allergens (FR labels match the backend's `allergens` field).
export const ALL_ALLERGENS = [
  "gluten",
  "lait",
  "œufs",
  "fruits à coque",
  "arachides",
  "soja",
  "poisson",
  "crustacés",
  "mollusques",
  "céleri",
  "moutarde",
  "sésame",
  "sulfites",
  "lupin",
] as const;

// Dietary regimes the app can match against OpenFoodFacts data.
export const ALL_DIETS = [
  "végétarien",
  "végan",
  "sans gluten",
  "sans lactose",
  "bio",
  "halal",
  "casher",
] as const;

const SCALE_ZOOM: Record<FontScale, string> = {
  normal: "1",
  large: "1.18",
  xl: "1.38",
};
const ORDER: FontScale[] = ["normal", "large", "xl"];

interface A11yState {
  fontScale: FontScale;
  highContrast: boolean;
  dark: boolean;
  allergens: string[];
  diets: string[];
  autoRead: boolean;
  ready: boolean;
  init: () => void;
  setFontScale: (s: FontScale) => void;
  biggerText: () => void;
  smallerText: () => void;
  toggleContrast: () => void;
  setDark: (v: boolean) => void;
  toggleDark: () => void;
  toggleAllergen: (a: string) => void;
  toggleDiet: (d: string) => void;
  setAutoRead: (v: boolean) => void;
}

function apply(state: { fontScale: FontScale; highContrast: boolean; dark: boolean }) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // `zoom` scales the entire UI proportionally (text + layout + fixed nav) — the most
  // reliable way to enlarge a px-based design for users who need bigger everything.
  (root.style as CSSStyleDeclaration & { zoom?: string }).zoom = SCALE_ZOOM[state.fontScale];
  root.classList.toggle("contrast", state.highContrast);
  root.classList.toggle("dark", state.dark);
}

function persist(get: () => A11yState) {
  try {
    const s = get();
    localStorage.setItem(
      "prixes.a11y",
      JSON.stringify({
        fontScale: s.fontScale,
        highContrast: s.highContrast,
        dark: s.dark,
        allergens: s.allergens,
        diets: s.diets,
        autoRead: s.autoRead,
      }),
    );
  } catch {
    /* ignore */
  }
}

export const useA11y = create<A11yState>((set, get) => ({
  fontScale: "normal",
  highContrast: false,
  dark: false,
  allergens: [],
  diets: [],
  autoRead: false,
  ready: false,

  init() {
    if (typeof window === "undefined") return;
    let saved: Partial<A11yState> = {};
    try {
      saved = JSON.parse(localStorage.getItem("prixes.a11y") || "{}");
    } catch {
      /* ignore */
    }
    // Honour the OS preference for dark mode on first visit.
    const dark =
      typeof saved.dark === "boolean"
        ? saved.dark
        : window.matchMedia?.("(prefers-color-scheme: dark)").matches || false;
    const next = {
      fontScale: (saved.fontScale as FontScale) || "normal",
      highContrast: !!saved.highContrast,
      dark,
    };
    apply(next);
    set({
      ...next,
      allergens: Array.isArray(saved.allergens) ? saved.allergens : [],
      diets: Array.isArray(saved.diets) ? saved.diets : [],
      autoRead: !!saved.autoRead,
      ready: true,
    });
  },

  setFontScale(fontScale) {
    set({ fontScale });
    apply(get());
    persist(get);
  },
  biggerText() {
    const i = ORDER.indexOf(get().fontScale);
    get().setFontScale(ORDER[Math.min(i + 1, ORDER.length - 1)]);
  },
  smallerText() {
    const i = ORDER.indexOf(get().fontScale);
    get().setFontScale(ORDER[Math.max(i - 1, 0)]);
  },
  toggleContrast() {
    set({ highContrast: !get().highContrast });
    apply(get());
    persist(get);
  },
  setDark(dark) {
    set({ dark });
    apply(get());
    persist(get);
  },
  toggleDark() {
    get().setDark(!get().dark);
  },
  toggleAllergen(a) {
    const has = get().allergens.includes(a);
    set({ allergens: has ? get().allergens.filter((x) => x !== a) : [...get().allergens, a] });
    persist(get);
  },
  toggleDiet(d) {
    const has = get().diets.includes(d);
    set({ diets: has ? get().diets.filter((x) => x !== d) : [...get().diets, d] });
    persist(get);
  },
  setAutoRead(autoRead) {
    set({ autoRead });
    persist(get);
  },
}));
