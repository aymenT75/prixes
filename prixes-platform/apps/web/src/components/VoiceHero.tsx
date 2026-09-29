"use client";

/**
 * « Que voulez-vous faire ? » — the top of the home page (design C).
 *
 * The Caddie listens and points to the one microphone, in the centre of the
 * tab bar. Three example sentences can be tapped to run exactly as if spoken,
 * so a sighted user sees what they can ask without a second mic on the page.
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
      <MascotScene pose="ecoute" state="listening" className="h-[200px]" />
      <div className="bg-gradient-to-br from-lime-200 via-lime-100 to-cyan-200 px-5 pb-5 pt-4 text-center dark:from-surface-container dark:via-surface-container dark:to-surface-container-high">
        <h2 id="voice-hero-title" className="text-[22px] font-extrabold text-slate-900 dark:text-on-surface">
          Que voulez-vous faire ?
        </h2>
        <p className="text-[15px] font-semibold text-slate-700 dark:text-on-surface-variant">
          Touchez le micro <span className="whitespace-nowrap">en bas</span> et parlez. Je m&apos;occupe du reste.
          <Icon name="arrow_downward" className="ml-1 align-[-5px] text-[20px] text-primary" />
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
