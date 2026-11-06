"use client";

/**
 * In the shop: one product at a time, aisle after aisle in the order you walk
 * them, said aloud. Hands free: after each product the guide listens on its
 * own, and "je l'ai", "pas trouvé", "répète" or "stop" answer it. It says when
 * the shop has no price for a product and offers the equivalent it sells
 * instead, and names what is not sold here at all.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon, Tick } from "@/components/Icon";
import { byAisle } from "@/lib/courses";
import { eur } from "@/lib/format";
import { screenReaderOn, talk } from "@/lib/say";
import type { BasketItem, ShoppingItem, StoreBasketDetail } from "@/lib/types";
import { useDialog } from "@/lib/useDialog";
import {
  createVoiceRecognizer,
  hapticSuccess,
  speechSupported,
  stopSpeaking,
  type VoiceRecognizer,
} from "@/lib/voice";
import { spokenPrice } from "@/lib/voiceTasks";

type Step = { aisle: string; item: BasketItem };

const TAKE = /\b(je l'?\s?ai|pris|prise|c'est bon|ok|okay|oui|suivant|dans le caddie|fait)\b/;
const SKIP = /\b(passe|passer|pas trouv|rupture|plus tard|saute|non)\b/;
const AGAIN = /\b(r[ée]p[èe]te|encore|quoi|pardon|comment)\b/;
const STOP = /\b(stop|arr[êe]te|ferme|quitte)\b/;
/** Silences in a row before the guide stops listening on its own. */
const MAX_SILENCES = 2;

function listName(i: ShoppingItem): string {
  return i.name ?? i.free_text ?? i.barcode ?? "";
}

export function InStoreGuide({
  basket,
  list,
  missing,
  onTake,
  onClose,
}: {
  basket: StoreBasketDetail;
  /** The shopping list, to tick the line that matches each product. */
  list: ShoppingItem[];
  /** Products of the list this shop does not sell, not even an equivalent. */
  missing: string[];
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
  const [spent, setSpent] = useState(0);
  const [count, setCount] = useState(0);
  const [listening, setListening] = useState(false);
  const rec = useRef<VoiceRecognizer | null>(null);
  const silences = useRef(0);
  const closed = useRef(false);
  const current = steps[index];
  const finished = index >= steps.length;

  // The voice callbacks outlive a render: they call whatever is current.
  const act = useRef({ take: () => {}, skip: () => {}, again: () => {} });

  function phrase(step: Step): string {
    const n = step.item.quantity > 1 ? `, ${step.item.quantity} fois` : "";
    const what = step.item.equivalent_of
      ? `Pas de ${step.item.equivalent_of} ici. Prenez l'équivalent : ${step.item.label}${n}`
      : `${step.item.label}${n}`;
    return `Rayon ${step.aisle}. ${what}, ${spokenPrice(step.item.unit_price)}. Dites : je l'ai.`;
  }

  function sayThenListen(text: string) {
    rec.current?.stop();
    talk(text, () => {
      // Under VoiceOver the mic would hear VoiceOver: the buttons do the work.
      if (!closed.current && speechSupported() && !screenReaderOn()) listen();
    });
  }

  // Each new product (or the end) is said, then the guide listens.
  useEffect(() => {
    if (finished) {
      rec.current?.stop();
      const est = Math.round(spent * 100) / 100;
      talk(`Courses terminées. ${count} produit${count > 1 ? "s" : ""} pris. Total estimé : ${spokenPrice(est)}.`);
      return;
    }
    if (!current) return;
    let intro = "";
    if (index === 0 && missing.length) {
      intro =
        missing.length === 1
          ? `${missing[0]} n'est pas vendu ici. `
          : `${missing.length} produits ne sont pas vendus ici : ${missing.slice(0, 4).join(", ")}. `;
    }
    sayThenListen(intro + phrase(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on each new product
  }, [index]);

  useEffect(() => {
    // Re-armed on (re)mount: React may mount twice in development.
    closed.current = false;
    return () => {
      closed.current = true;
      rec.current?.stop();
      stopSpeaking();
    };
  }, []);

  function take() {
    if (!current) return;
    const it = current.item;
    const line = list.find(
      (i) => !i.checked && (i.barcode === it.barcode || (!!it.equivalent_of && listName(i) === it.equivalent_of)),
    );
    if (line) onTake(line.id);
    hapticSuccess();
    setSpent((s) => s + Number(it.line_total));
    setCount((c) => c + 1);
    setIndex((i) => i + 1);
  }
  const skip = () => setIndex((i) => i + 1);
  function again() {
    silences.current = 0;
    if (current) sayThenListen(phrase(current));
  }

  act.current = { take, skip, again };

  function listen() {
    if (closed.current) return;
    const r = createVoiceRecognizer();
    if (!r) return;
    rec.current?.stop();
    rec.current = r;
    let heard = false;
    r.onFinal = (raw) => {
      const t = raw.toLowerCase();
      heard = true;
      silences.current = 0;
      if (STOP.test(t)) onClose();
      else if (AGAIN.test(t)) act.current.again();
      else if (SKIP.test(t)) act.current.skip();
      else if (TAKE.test(t)) act.current.take();
      else heard = false;
    };
    r.onEnd = () => {
      setListening(false);
      // Nothing understood: listen again, a couple of times, then wait for a tap.
      if (!heard && !closed.current && silences.current < MAX_SILENCES) {
        silences.current += 1;
        window.setTimeout(listen, 250);
      }
    };
    r.onError = () => setListening(false);
    setListening(true);
    r.start();
  }

  const label = current ? current.item.label : "";
  const big = label.length <= 8 ? "text-[88px]" : label.length <= 16 ? "text-[60px]" : "text-[44px]";

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
      className="guide fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-surface"
    >
      <div className="screen-top flex-1 pt-[calc(env(safe-area-inset-top)+12px)]">
        <header className="flex min-h-16 items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="guide-title" className="text-[23px] font-bold text-on-surface" aria-live="polite">
              {finished ? basket.store : `Produit ${index + 1} sur ${steps.length}`}
            </h2>
            {!finished && (
              <div aria-hidden className={`mt-2 flex ${steps.length > 12 ? "gap-[3px]" : "gap-1.5"}`}>
                {steps.map((_, n) => (
                  <i
                    key={n}
                    className={`h-2 flex-1 rounded-full border-[1.5px] transition-colors duration-500 ${
                      n <= index
                        ? "border-[rgb(var(--tick))] bg-[rgb(var(--tick))]"
                        : "border-[rgb(var(--hair))]"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Quitter le guidage" className="round-btn">
            <Icon name="close" className="text-[32px]" />
          </button>
        </header>

        {!finished && current && (
          <div key={index} className="prixes-rise mt-6 flex flex-col text-on-surface" aria-live="assertive">
            <p className="text-[27px] font-bold text-[rgb(var(--accent-text))]">Rayon {current.aisle}</p>
            {current.item.equivalent_of && (
              <p className="mt-1 text-[22px]">Pas de {current.item.equivalent_of} ici. L&apos;équivalent :</p>
            )}
            <p className={`my-2 break-words font-bold leading-none tracking-[-0.015em] ${big}`}>
              {current.item.label}
              {current.item.quantity > 1 ? ` × ${current.item.quantity}` : ""}
            </p>
            <p className="text-[32px] tabular-nums">{eur(current.item.unit_price)}</p>
          </div>
        )}

        {index === 0 && missing.length > 0 && !finished && (
          <p className="mt-3.5 flex items-start gap-2 text-[21px] leading-snug text-on-surface" role="note">
            <Icon name="info" className="mt-px text-[26px]" />
            <span>
              Pas vendu ici :{" "}
              {missing.length <= 3
                ? missing.join(", ")
                : `${missing.slice(0, 2).join(", ")} et ${missing.length - 2} autres`}
              .
            </span>
          </p>
        )}

        {finished && (
          <div className="prixes-rise mt-6 flex flex-col gap-2 text-on-surface" role="status">
            <p className="text-[48px] font-bold leading-tight">Courses terminées</p>
            <p className="text-[24px]">
              {count} produit{count > 1 ? "s" : ""} pris, environ {eur(Math.round(spent * 100) / 100)}.
            </p>
          </div>
        )}

        {!finished && listening && (
          <p className="mt-auto pt-4 text-[22px] text-on-surface" aria-hidden>
            J&apos;écoute : dites « je l&apos;ai »
          </p>
        )}
      </div>

      {!finished ? (
        <>
          <button
            onClick={take}
            className="sheet tone-gold min-h-[200px] flex-1 justify-center gap-[22px] pb-[50px] text-[62px]"
          >
            <span key={index} className="mic-disc draw h-[104px] w-[104px]">
              <Tick size={62} />
            </span>
            Je l&apos;ai
          </button>
          <div className="split">
            <button onClick={skip} className="tone-n1">
              <Icon name="search_off" className="text-[42px]" /> Pas trouvé
            </button>
            <button onClick={again} className="tone-n2">
              <Icon name="replay" className="text-[42px]" /> Répéter
            </button>
          </div>
        </>
      ) : (
        <button onClick={onClose} className="sheet tone-gold">
          <Icon name="done" className="text-[46px]" /> Terminer
        </button>
      )}
    </div>
  );
}
