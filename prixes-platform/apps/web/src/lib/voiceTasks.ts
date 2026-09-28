/**
 * Voice tasks — what the microphone asked a page to do once it opens.
 *
 * The assistant understands "essence la moins chère", but the fuel search lives
 * on the fuel page. So the assistant queues a task, shows the mascot at work and
 * navigates; the page runs the task on arrival and reports back with `finish`,
 * and the assistant shows and says the result. A task is taken once: going back
 * to the page later does not run it again.
 */
import { create } from "zustand";

export type FuelId = "gazole" | "sp95" | "sp98" | "e85" | "gplc";

export type VoiceTask =
  | { kind: "fuel"; fuel: FuelId }
  | { kind: "stores" }
  | { kind: "split" }
  | { kind: "cart"; prompt: string }
  | { kind: "menu-compose" }
  | { kind: "menu-swap"; day: number }
  | { kind: "scan" };

/** The mascot's poses (public/mascotte/caddie-<pose>.webp). */
export type Pose = "ecoute" | "roule" | "plein" | "pompe" | "loupe" | "assiette";

export interface VoiceResult {
  say: string;
  pose: Pose;
  ok: boolean;
}

interface VoiceTaskState {
  task: VoiceTask | null;
  /** Set by the page when the task is done; the assistant shows and says it. */
  result: VoiceResult | null;
  queue: (task: VoiceTask) => void;
  take: <K extends VoiceTask["kind"]>(kind: K) => Extract<VoiceTask, { kind: K }> | null;
  finish: (say: string, pose: Pose, ok?: boolean) => void;
  clearResult: () => void;
}

export const useVoiceTask = create<VoiceTaskState>((set, get) => ({
  task: null,
  result: null,
  queue: (task) => set({ task, result: null }),
  take: (kind) => {
    const task = get().task;
    if (!task || task.kind !== kind) return null;
    set({ task: null });
    return task as never;
  },
  finish: (say, pose, ok = true) => set({ result: { say, pose, ok } }),
  clearResult: () => set({ result: null }),
}));

/** The pose that goes with a task while it is running. */
export function workingPose(task: VoiceTask): Pose {
  switch (task.kind) {
    case "fuel":
      return "pompe";
    case "stores":
      return "loupe";
    case "menu-compose":
    case "menu-swap":
      return "assiette";
    default:
      return "roule";
  }
}

/** A distance the way it is said: "300 mètres", "1,2 kilomètre". */
export function spokenDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "une distance inconnue";
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} mètres`;
  const rounded = Math.round(km * 10) / 10;
  return `${String(rounded).replace(".", ",")} kilomètre${rounded >= 2 ? "s" : ""}`;
}

/** A price the way it is said: "1,72 €" reads well in French text-to-speech. */
export function spokenPrice(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

/**
 * A sentence to run as if it had been spoken — a tapped example on the home page.
 * The assistant takes it when it opens instead of listening.
 */
export const useVoicePhrase = create<{ phrase: string | null; set: (p: string | null) => void }>((set) => ({
  phrase: null,
  set: (phrase) => set({ phrase }),
}));
