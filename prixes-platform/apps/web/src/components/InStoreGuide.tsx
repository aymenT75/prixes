"use client";

/**
 * In the shop: one product at a time, aisle after aisle in the order you walk
 * them, said aloud. Hands free: after each product the guide listens on its
 * own, and "pris", "pas trouvé", "répète" or "stop" answer it — the buttons
 * are there for whoever prefers them. It says when the shop has no price for
 * a product and offers the equivalent it sells instead, and names what is not
 * sold here at all. At the end the shop is recorded in the month's budget.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { byAisle } from "@/lib/courses";
import { eur } from "@/lib/format";
import type { BasketItem, BudgetSummary, ShoppingItem, StoreBasketDetail } from "@/lib/types";
import { useDialog } from "@/lib/useDialog";
import {
  createVoiceRecognizer,
  hapticSuccess,
  speak,
  speechSupported,
  stopSpeaking,
  type VoiceRecognizer,
} from "@/lib/voice";
import { spokenPrice } from "@/lib/voiceTasks";

type Step = { aisle: string; item: BasketItem };

const TAKE = /\b(pris|prise|c'est bon|ok|okay|oui|suivant|dans le caddie|fait|enregistre)\b/;
const SKIP = /\b(passe|passer|pas trouv|rupture|plus tard|saute|non)\b/;
const AGAIN = /\b(r[ée]p[èe]te|encore|quoi|pardon|comment)\b/;
const STOP = /\b(stop|arr[êe]te|ferme)\b/;
/** Silences in a row before the guide stops listening on its own. */
const MAX_SILENCES = 2;

function listName(i: ShoppingItem): string {
  return i.name ?? i.free_text ?? i.barcode ?? "";
}

export function InStoreGuide({
  basket,
  list,
  missing,
  saving,
  onTake,
  onClose,
}: {
  basket: StoreBasketDetail;
  /** The shopping list, to tick the line that matches each product. */
  list: ShoppingItem[];
  /** Products of the list this shop does not sell, not even an equivalent. */
  missing: string[];
  /** What the same products cost at the dearest shop nearby, minus this one. */
  saving: { amount: number; versus: string } | null;
  onTake: (listItemId: string) => void;
  onClose: () => void;
}) {
  const panel = useDialog<HTMLDivElement>(true, onClose);
  const qc = useQueryClient();

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
  const [spent, setSpent] = useState(0);
  const [count, setCount] = useState(0);
  const [listening, setListening] = useState(false);
  // Hands free when the phone can listen. Read at once: the guide only ever
  // renders after a tap or a voice command, never in the prerendered page.
  const [handsFree, setHandsFree] = useState(() => speechSupported());
  const [saved, setSaved] = useState<BudgetSummary | null>(null);
  const [saving_, setSaving] = useState(false);
  const [total, setTotal] = useState("");
  const rec = useRef<VoiceRecognizer | null>(null);
  const silences = useRef(0);
  const closed = useRef(false);
  const current = steps[index];
  const finished = index >= steps.length;

  // The voice callbacks outlive a render: they call whatever is current.
  const act = useRef({ take: () => {}, skip: () => {}, again: () => {}, save: () => {} });

  function phrase(step: Step): string {
    const n = step.item.quantity > 1 ? `, ${step.item.quantity} fois` : "";
    const what = step.item.equivalent_of
      ? `Pas de ${step.item.equivalent_of} ici. Prenez l'équivalent : ${step.item.label}${n}`
      : `${step.item.label}${n}`;
    return `Rayon ${step.aisle}. ${what}, ${spokenPrice(step.item.unit_price)}.`;
  }

  function sayThenListen(text: string) {
    rec.current?.stop();
    speak(text, () => {
      if (handsFreeRef.current && !closed.current) listen();
    });
  }
  const handsFreeRef = useRef(false);
  handsFreeRef.current = handsFree;

  // Each new product (or the end) is said, then the guide listens.
  useEffect(() => {
    if (finished) {
      const est = Math.round(spent * 100) / 100;
      const sav =
        saving && saving.amount > 0
          ? ` Vous avez économisé ${spokenPrice(saving.amount)} par rapport à ${saving.versus}.`
          : "";
      setTotal(est ? est.toFixed(2).replace(".", ",") : "");
      sayThenListen(
        `Courses terminées.${sav} Total estimé : ${spokenPrice(est)}. Dites « enregistre » pour l'ajouter à votre budget du mois.`,
      );
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
    setTaken((t) => [it.label, ...t].slice(0, 3));
    setIndex((i) => i + 1);
  }
  const skip = () => setIndex((i) => i + 1);

  async function save() {
    if (saving_ || saved) return;
    const value = Number(total.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    try {
      const month = await api.addTrip({
        store: basket.store,
        total: value,
        saving: saving && saving.amount > 0 ? saving.amount : null,
        items: count,
      });
      setSaved(month);
      qc.setQueryData(["budget"], month);
      const left =
        month.left != null
          ? Number(month.left) >= 0
            ? ` Il vous reste ${spokenPrice(month.left)} pour le mois.`
            : ` Attention, vous avez dépassé votre budget du mois de ${spokenPrice(-Number(month.left))}.`
          : "";
      speak(`C'est noté. Ce mois-ci : ${spokenPrice(month.spent)} de courses.${left}`);
    } catch {
      speak("Je n'ai pas pu l'enregistrer. Réessayez avec le bouton.");
    } finally {
      setSaving(false);
    }
  }

  act.current = {
    take: finished ? () => void save() : take,
    skip,
    again: () => (finished ? undefined : current && sayThenListen(phrase(current))),
    save: () => void save(),
  };

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
      if (!heard && handsFreeRef.current && !closed.current && silences.current < MAX_SILENCES) {
        silences.current += 1;
        window.setTimeout(listen, 250);
      }
    };
    r.onError = () => setListening(false);
    setListening(true);
    r.start();
  }

  function toggleMic() {
    if (listening) {
      rec.current?.stop();
      setHandsFree(false);
      return;
    }
    silences.current = 0;
    setHandsFree(true);
    stopSpeaking();
    listen();
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

        {index === 0 && missing.length > 0 && !finished && (
          <p className="rounded-xl bg-surface-container p-3 text-body-md text-on-surface-variant" role="note">
            Pas vendu ici : {missing.join(", ")}.
          </p>
        )}

        {!finished && current && (
          <div
            key={index}
            className="prixes-rise flex flex-col gap-1 rounded-3xl bg-on-surface p-5 text-surface dark:bg-surface-container-high dark:text-on-surface"
            aria-live="assertive"
          >
            <p className="text-micro font-extrabold uppercase tracking-widest text-primary-container">
              Rayon {current.aisle}
            </p>
            {current.item.equivalent_of && (
              <p className="text-body-md opacity-85">
                Pas de {current.item.equivalent_of} ici · l&apos;équivalent :
              </p>
            )}
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
          <div
            className="prixes-rise flex flex-col items-center gap-3 rounded-3xl bg-tertiary-container p-6 text-center text-on-tertiary-container"
            role="status"
          >
            <Icon name="celebration" className="text-[44px]" />
            <p className="text-headline-md">Courses terminées</p>
            {saving && saving.amount > 0 && (
              <p className="text-body-md">
                Économisé par rapport à {saving.versus} :{" "}
                <b className="text-[28px] tabular-nums">{eur(saving.amount)}</b>
              </p>
            )}
            {saved ? (
              <p className="text-body-md">
                Enregistré. Ce mois-ci : <b>{eur(Number(saved.spent))}</b> de courses
                {saved.monthly != null && (
                  <>
                    {" "}
                    sur <b>{eur(Number(saved.monthly))}</b>
                  </>
                )}
                .
              </p>
            ) : (
              <form
                className="flex w-full flex-wrap items-center justify-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <label htmlFor="trip-total" className="text-label-md">
                  Total payé
                </label>
                <input
                  id="trip-total"
                  inputMode="decimal"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  className="input min-h-11 w-28 text-center text-on-surface"
                />
                <span className="text-label-md">€</span>
                <button type="submit" disabled={saving_} className="btn-primary min-h-11 px-4">
                  Enregistrer
                </button>
              </form>
            )}
          </div>
        )}

        {taken.length > 0 && (
          <ul className="card space-y-1 p-3" aria-label="Déjà dans le caddie">
            {taken.map((label, i) => (
              <li key={`${label}-${i}`} className="flex items-center gap-3 py-1 text-body-md">
                <span
                  data-on="true"
                  className="prixes-tick grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary-container text-on-primary-container"
                >
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
                <button onClick={() => current && sayThenListen(phrase(current))} className="btn-outline flex-1 py-3">
                  <Icon name="volume_up" className="text-[20px]" /> Répéter
                </button>
              </div>
            </>
          ) : (
            <button onClick={onClose} className="btn-outline w-full py-4">
              Retour à la liste
            </button>
          )}
          <button
            onClick={toggleMic}
            aria-label={listening ? "Arrêter l'écoute" : "Répondre à la voix"}
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
          <p className="text-center text-micro text-on-surface-variant" aria-live="polite">
            {listening ? "J'écoute : « pris », « pas trouvé », « répète »…" : "Touchez le micro pour répondre à la voix"}
          </p>
        </div>
      </div>
    </div>
  );
}
