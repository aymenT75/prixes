"use client";

/**
 * The Caddie at work — the mascot that shows what the voice assistant is doing.
 *
 * One pose per task (listening, rolling, full cart, at the pump, with the
 * magnifying glass, carrying the plate) on the task's colour. While a task runs
 * the Caddie rolls and bobs; when it is done it hops and a badge pops with the
 * result. The picture is decorative (alt=""): the words are said aloud and
 * written below it, which is what a screen-reader user gets.
 */

import type { Pose } from "@/lib/voiceTasks";

// One background for every pose, drawn from the theme: a yellow glow on the
// surface colour, so the scene follows Jour and Nuit instead of six fixed
// pastel gradients that glared at night.
const SCENE_BG =
  "radial-gradient(circle at 50% 45%, rgb(var(--color-primary-container) / .55), transparent 62%), rgb(var(--color-surface-container))";
const BACKGROUND: Record<Pose, string> = {
  ecoute: SCENE_BG,
  roule: SCENE_BG,
  plein: SCENE_BG,
  pompe: SCENE_BG,
  loupe: SCENE_BG,
  assiette: SCENE_BG,
};

export type SceneState = "listening" | "working" | "done" | "failed";

export function MascotScene({
  pose,
  state,
  badge,
  className = "h-[210px]",
}: {
  pose: Pose;
  state: SceneState;
  badge?: string | null;
  className?: string;
}) {
  const motion =
    state === "working" ? "mascot-work" : state === "done" ? "mascot-hop" : state === "failed" ? "mascot-shake" : "mascot-bob";
  return (
    <div
      className={`relative flex items-end justify-center overflow-hidden rounded-3xl ${className}`}
      style={{ background: BACKGROUND[pose] }}
    >
      {state === "listening" && (
        <>
          <span className="mascot-wave absolute left-1/2 top-1/2 -ml-16 -mt-16 h-32 w-32 rounded-full border-4 border-white/70" />
          <span className="mascot-wave absolute left-1/2 top-1/2 -ml-16 -mt-16 h-32 w-32 rounded-full border-4 border-white/70 [animation-delay:.6s]" />
        </>
      )}
      {state === "done" &&
        [
          ["-110px", "-70px", "0s"],
          ["120px", "-40px", ".1s"],
          ["-80px", "30px", ".2s"],
          ["95px", "40px", ".15s"],
        ].map(([x, y, d]) => (
          <span
            key={x}
            aria-hidden
            className="mascot-sparkle absolute left-1/2 top-1/2 text-[24px] text-white drop-shadow"
            style={{ marginLeft: x, marginTop: y, animationDelay: d }}
          >
            ✦
          </span>
        ))}
      {/* eslint-disable-next-line @next/next/no-img-element -- static export: no image optimiser */}
      <img
        key={`${pose}-${state}`}
        src={`/mascotte/caddie-${pose}.webp`}
        alt=""
        className={`relative mb-2 h-[88%] w-auto drop-shadow-2xl ${motion}`}
      />
      {badge && (
        <span className="mascot-badge absolute right-3 top-3 max-w-[60%] truncate rounded-full bg-primary-container px-3 py-1.5 text-[15px] font-extrabold text-on-primary-container shadow-lg">
          {badge}
        </span>
      )}
    </div>
  );
}
