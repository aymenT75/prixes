// Guided product tour — a lightweight spotlight walkthrough of the app's main
// features. State only; the actual overlay UI lives in components/ProductTour.tsx.
import { create } from "zustand";

const SEEN_KEY = "prixes.tour.seen";

export interface TourStep {
  id: string;
  /** CSS selector for the element to spotlight, or null for a centered (no-target) step. */
  target: string | null;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Bienvenue dans Prixes \u{1F44B}",
    body: "On vous fait visiter l'app en quelques secondes pour vous montrer l'essentiel.",
  },
  {
    id: "courses",
    target: '[data-tour="nav-courses"]',
    title: "Cherchez & comparez",
    body: "Trouvez n'importe quel produit et comparez son prix entre plusieurs magasins.",
  },
  {
    id: "scanner",
    target: '[data-tour="nav-scanner"]',
    title: "Scannez un code-barres",
    body: "Visez le code-barres d'un produit en rayon pour voir son prix instantanément.",
  },
  {
    id: "fuel",
    target: '[data-tour="nav-fuel"]',
    title: "Carburant le moins cher",
    body: "Trouvez la station essence la moins chère près de vous (Diesel, SP95-E10, E85).",
  },
  {
    id: "deals",
    target: '[data-tour="nav-deals"]',
    title: "Bons plans",
    body: "Découvrez les meilleures offres de prix partagées par la communauté.",
  },
  {
    id: "stores",
    target: '[data-tour="shortcut-stores"]',
    title: "Magasins proches",
    body: "Localisez le supermarché le plus proche de vous et son itinéraire.",
  },
  {
    id: "voice",
    target: '[data-tour="voice-btn"]',
    title: "Assistant vocal",
    body: "Appuyez et dites « cherche du lait » — l'app s'occupe du reste.",
  },
  {
    id: "a11y",
    target: '[data-tour="a11y-btn"]',
    title: "Accessibilité",
    body: "Agrandissez le texte, activez le contraste, adaptez l'app à vos besoins.",
  },
  {
    id: "done",
    target: null,
    title: "Vous êtes prêt·e ! \u{1F389}",
    body: "Vous pouvez revoir cette visite à tout moment depuis les options d'accessibilité.",
  },
];

export function hasSeenTour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markTourSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

interface TourState {
  active: boolean;
  stepIndex: number;
  start: () => void;
  next: () => void;
  prev: () => void;
  end: () => void;
}

export const useTour = create<TourState>((set, get) => ({
  active: false,
  stepIndex: 0,
  start() {
    set({ active: true, stepIndex: 0 });
  },
  next() {
    set({ stepIndex: get().stepIndex + 1 });
  },
  prev() {
    set({ stepIndex: Math.max(0, get().stepIndex - 1) });
  },
  end() {
    markTourSeen();
    set({ active: false });
  },
}));
