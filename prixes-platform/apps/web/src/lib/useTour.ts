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
  /** When true, this step can't be dismissed early (no "X", no "Passer", no
   * Escape) — only "Suivant" moves past it. Reserve for information a new
   * user genuinely needs (e.g. what the product colours mean), not routine
   * feature tips. */
  mandatory?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Bienvenue dans Prixes \u{1F44B}",
    body: "On vous fait visiter l'app en quelques secondes pour vous montrer l'essentiel.",
  },
  {
    id: "assistant",
    target: '[data-tour="nav-assistant"]',
    title: "Vos courses en 3 étapes",
    body:
      "Préparez la liste, comparez les magasins, puis laissez-vous guider jusqu'au " +
      "moins cher.",
  },
  {
    id: "today",
    target: '[data-tour="today"]',
    title: "Où faire vos courses aujourd'hui",
    body: "À chaque ouverture, Prixes a déjà comparé les magasins autour de vous pour votre liste. Touchez « On y va ».",
  },
  {
    id: "stores",
    target: '[data-tour="nav-stores"]',
    title: "Les magasins autour de vous",
    body: "Prixes trouve les enseignes proches et vous dit ce que coûte votre liste dans chacune.",
  },
  {
    id: "fuel",
    target: '[data-tour="nav-fuel"]',
    title: "Carburant",
    body: "Comparez les prix des carburants dans les stations autour de vous.",
  },
  {
    id: "voice",
    target: '[data-tour="voice-btn"]',
    title: "Assistant vocal",
    body: "Touchez le micro au centre, en bas, et parlez : « une raclette pour 6 », « essence la moins chère »… Je m'occupe du reste.",
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
