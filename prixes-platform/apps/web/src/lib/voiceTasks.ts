/** What the assistant and the guide say: prices and distances for the ear, and the greeting. */
import { create } from "zustand";

/** A distance the way it is said: "300 mètres", "1,2 kilomètre". */
export function spokenDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "une distance inconnue";
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} mètres`;
  const rounded = Math.round(km * 10) / 10;
  return `${String(rounded).replace(".", ",")} kilomètre${rounded >= 2 ? "s" : ""}`;
}

/**
 * A price the way it is said: "1,72 €" reads well in French text-to-speech.
 * The API sends money as decimal strings ("12.40"): taking only numbers threw
 * inside the pages' effects and left the assistant silent.
 */
export function spokenPrice(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "un prix inconnu";
  return `${n.toFixed(2).replace(".", ",")} €`;
}

/**
 * Opens the assistant from outside a tap — the app opening, the "Parler à
 * Prixes" shortcut — with a greeting that says what to do, then listens.
 */
export const useVoiceGreeting = create<{ greeting: string | null; set: (g: string | null) => void }>((set) => ({
  greeting: null,
  set: (greeting) => set({ greeting }),
}));
