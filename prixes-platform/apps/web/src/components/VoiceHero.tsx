"use client";

/**
 * « Que voulez-vous faire ? » — the top of the home page (design C).
 *
 * The microphone is the way in: the Caddie listens next to a big mic button,
 * and three example sentences can be tapped to run exactly as if spoken. A
 * screen-reader user lands on one button with a clear name; a sighted user
 * sees what they can ask.
 */

import { Icon } from "@/components/Icon";
import { MascotScene } from "@/components/MascotScene";
import { useA11y } from "@/lib/useA11y";
import { useVoicePhrase } from "@/lib/voiceTasks";

const EXAMPLES = ["Une raclette pour 6", "Essence la moins chère", "Compose mon menu"];

export function VoiceHero() {
  const openVoice = useA11y((s) => s.setVoiceOpen);
  const setPhrase = useVoicePhrase((s) => s.set);

  return (
    <section aria-labelledby="voice-hero-title" className="mb-6 overflow-hidden rounded-[28px] shadow-float">
      <div className="relative">
        <MascotScene pose="ecoute" state="listening" className="h-[210px]" />
        <button
          onClick={() => openVoice(true)}
          aria-label="Parler à Prixes, assistant vocal"
          className="absolute bottom-6 right-5 grid h-24 w-24 place-items-center rounded-full bg-slate-900 text-lime-300 shadow-float ring-4 ring-white/70 transition-transform active:scale-95"
        >
          <span aria-hidden className="mascot-wave absolute inset-0 rounded-full border-4 border-slate-900/60" />
          <Icon name="mic" fill style={{ fontSize: 52 }} className="relative" />
        </button>
      </div>
      <div className="bg-gradient-to-br from-lime-200 via-lime-100 to-cyan-200 px-5 pb-5 pt-4 text-center dark:from-surface-container dark:via-surface-container dark:to-surface-container-high">
        <h2 id="voice-hero-title" className="text-[22px] font-extrabold text-slate-900 dark:text-on-surface">
          Que voulez-vous faire ?
        </h2>
        <p className="text-[15px] font-semibold text-slate-700 dark:text-on-surface-variant">
          Touchez le micro et parlez. Je m&apos;occupe du reste.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((x) => (
            <button
              key={x}
              onClick={() => {
                setPhrase(x);
                openVoice(true);
              }}
              className="min-h-[40px] rounded-full bg-white/90 px-3.5 py-2 text-[14px] font-bold text-slate-800 shadow-sm transition-transform active:scale-95 dark:bg-surface-container-highest dark:text-on-surface"
            >
              « {x} »
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
