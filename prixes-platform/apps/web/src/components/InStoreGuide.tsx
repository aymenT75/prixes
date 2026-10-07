"use client";

/**
 * In the shop: one product at a time, aisle after aisle in the order you walk
 * them, said aloud. "Pris" ticks it on the list and moves on, by voice or by a
 * button big enough to hit with a trolley in the other hand. At the end, what
 * the trip saved.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { byAisle } from "@/lib/courses";
import { eur } from "@/lib/format";
import type { BasketItem, ShoppingItem, StoreBasketDetail } from "@/lib/types";
import { useDialog } from "@/lib/useDialog";
import { createVoiceRecognizer, hapticSuccess, speak, stopSpeaking, type VoiceRecognizer } from "@/lib/voice";
import { spokenPrice } from "@/lib/voiceTasks";

type Step = { aisle: string; item: BasketItem };

const TAKE = /\b(pris|prise|c'est bon|ok|okay|oui|suivant|dans le caddie|fait)\b/;
const SKIP = /\b(passe|passer|pas trouv|rupture|plus tard|saute)\b/;
const AGAIN = /\b(r[ée]p[èe]te|encore|quoi|pardon)\b/;
const STOP = /\b(stop|termin|fini|arr[êe]te)\b/;

export function InStoreGuide({
  basket,
  list,
  saving,
  onTake,
  onClose,
}: {
  basket: StoreBasketDetail;
  /** The shopping list, to tick the line that matches each product. */
  list: ShoppingItem[];
  /** What the same products cost at the dearest shop nearby, minus this one. */
  saving: { amount: number; versus: string } | null;
  onTake: (listItemId: string) => void;
  onClose: () => void;
}) {
  const panel = useDialog<HTMLDivElement>(true, onClose);

  // What is still to buy, in walking order. Fixed on opening: ticking a line
  // must not reshuffle the route under your feet.
  const steps = useMemo<Step[]>(() => {
    const done = new Set(list.filter((i) => i.checked && i.barcode).map((i) => i.barcode));
    return byAisle(basket.items)
      .flatMap((g) => g.items.map((item) => ({ aisle: g.aisle, item })))
      .filter((s) => !done.has(s.item.barcode));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on opening
  }, [basket]);

  const [index, setIndex] = useState(0);
  const [taken, setTaken] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const rec = useRef<VoiceRecognizer | null>(null);
  const current = steps[index];
  const finished = index >= steps.length;

  function say(step: Step | undefined) {
    if (!step) return;
    const n = step.item.quantity > 1 ? `, ${step.item.quantity} fois` : "";
    speak(`Rayon ${step.aisle}. ${step.item.label}${n}, ${spokenPrice(step.item.unit_price)}.`);
  }

  useEffect(() => {
    if (finished) {
      speak(
        saving && saving.amount > 0
          ? `Courses terminées. Vous avez économisé ${spokenPrice(saving.amount)} par rapport à ${saving.versus}.`
          : "Courses terminées.",
      );
    } else say(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on each new product
  }, [index]);

  useEffect(
    () => () => {
      rec.current?.stop();
      stopSpeaking();
    },
    [],
  );

  function take() {
    if (!current) return;
    const line = list.find((i) => i.barcode === current.item.barcode && !i.checked);
    if (line) onTake(line.id);
    hapticSuccess();
    setTaken((t) => [current.item.label, ...t].slice(0, 3));
    setIndex((i) => i + 1);
  }
  const skip = () => setIndex((i) => i + 1);

  function listen() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = createVoiceRecognizer();
    if (!r) return;
    stopSpeaking();
    rec.current = r;
    r.onFinal = (raw) => {
      const t = raw.toLowerCase();
      if (STOP.test(t)) onClose();
      else if (AGAIN.test(t)) say(current);
      else if (SKIP.test(t)) skip();
      else if (TAKE.test(t)) take();
    };
    r.onEnd = () => setListening(false);
    r.onError = () => setListening(false);
    setListening(true);
    r.start();
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+12px)]"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4">
        <header className="flex items-center justify-between gap-2">
          <h2 id="guide-title" className="text-headline-md text-on-surface">
            {basket.store}
          </h2>
          <span className="text-label-md tabular-nums text-on-surface-variant" aria-live="polite">
            {Math.min(index, steps.length)} / {steps.length}
          </span>
          <button onClick={onClose} aria-label="Fermer le guide" className="grid min-h-11 min-w-11 place-items-center">
            <Icon name="close" />
          </button>
        </header>
        <div className="h-2 overflow-hidden rounded-full bg-surface-container" aria-hidden>
          <i
            className="block h-full rounded-full bg-primary-container transition-[width] duration-500"
            style={{ width: `${steps.length ? (Math.min(index, steps.length) / steps.length) * 100 : 100}%` }}
          />
        </div>

        {!finished && current && (
          <div key={index} className="prixes-rise flex flex-col gap-1 rounded-3xl bg-on-surface p-5 text-surface dark:bg-surface-container-high dark:text-on-surface" aria-live="assertive">
            <p className="text-micro font-extrabold uppercase tracking-widest text-primary-container">
              Rayon {current.aisle}
            </p>
            <p className="text-[26px] font-extrabold leading-tight">
              {current.item.label}
              {current.item.quantity > 1 ? ` × ${current.item.quantity}` : ""}
            </p>
            <p className="text-body-md opacity-85">
              {eur(current.item.unit_price)} · dites « pris » quand c&apos;est dans le caddie
            </p>
          </div>
        )}

        {finished && (
          <div className="prixes-rise flex flex-col items-center gap-3 rounded-3xl bg-tertiary-container p-6 text-center text-on-tertiary-container" role="status">
            <Icon name="celebration" className="text-[44px]" />
            <p className="text-headline-md">Courses terminées</p>
            {saving && saving.amount > 0 && (
              <p className="text-body-md">
                Économisé par rapport à {saving.versus} :{" "}
                <b className="text-[28px] tabular-nums">{eur(saving.amount)}</b>
              </p>
            )}
          </div>
        )}

        {taken.length > 0 && (
          <ul className="card space-y-1 p-3" aria-label="Déjà dans le caddie">
            {taken.map((label, i) => (
              <li key={`${label}-${i}`} className="flex items-center gap-3 py-1 text-body-md">
                <span data-on="true" className="prixes-tick grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary-container text-on-primary-container">
                  <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden>
                    <path d="M2.5 7.5l3 3 6-6.5" />
                  </svg>
                </span>
                <s className="text-on-surface-variant">{label}</s>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex flex-col gap-3">
          {!finished ? (
            <>
              <button onClick={take} className="btn-primary w-full py-4 text-headline-md">
                <Icon name="check" /> Pris
              </button>
              <div className="flex gap-2">
                <button onClick={skip} className="btn-outline flex-1 py-3">
                  Pas trouvé
                </button>
                <button onClick={() => say(current)} className="btn-outline flex-1 py-3">
                  <Icon name="volume_up" className="text-[20px]" /> Répéter
                </button>
              </div>
              <button
                onClick={listen}
                aria-label={listening ? "Arrêter d'écouter" : "Répondre à la voix"}
                aria-pressed={listening}
                data-listening={listening}
                className="prixes-orb relative mx-auto mt-1 grid h-[72px] w-[72px] place-items-center bg-primary-container text-on-primary-container shadow-glow"
              >
                {listening && (
                  <span aria-hidden>
                    <span className="prixes-ripple" />
                    <span className="prixes-ripple" />
                  </span>
                )}
                <Icon name={listening ? "graphic_eq" : "mic"} fill className="relative text-[32px]" />
              </button>
            </>
          ) : (
            <button onClick={onClose} className="btn-primary w-full py-4">
              Retour à la liste
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
