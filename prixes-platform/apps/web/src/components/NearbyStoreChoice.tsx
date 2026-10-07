"use client";

/**
 * "Où faire vos courses ?" — the assistant finds the chains around you on its
 * own, prices your whole list in each, and advises one according to what you
 * care about: a cursor from "Le moins cher" to "Le plus proche", and your
 * budget. It asks before choosing; the answer is yours.
 *
 * Prices are per chain (Open Prices records them by store brand); the distance
 * is to that chain's nearest branch.
 */

import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { adviceReason, rankStores, readPriority, savePriority, useStoreAdvice } from "@/lib/courses";
import { distance, eur } from "@/lib/format";
import { getCurrentPosition } from "@/lib/geo";
import { findBranch } from "@/lib/stores";
import type { SplitResult, Store, StoreBasketDetail } from "@/lib/types";
import { useA11y } from "@/lib/useA11y";
import { speak } from "@/lib/voice";
import { spokenDistance, spokenPrice } from "@/lib/voiceTasks";

export interface NearbyPick {
  basket: StoreBasketDetail;
  branch: Store;
}

type Status = "locating" | "ready" | "denied" | "none";

interface Row extends NearbyPick {
  store: string;
  total: number;
  km: number;
  items: number;
}

/** How many shops the list shows before "Autre enseigne". */
const SHOWN = 4;

export function NearbyStoreChoice({
  plan,
  budget,
  onBudget,
  onPick,
  onUnavailable,
  more,
}: {
  plan: SplitResult;
  budget: number | null;
  onBudget: (value: number | null) => void;
  onPick: (pick: NearbyPick) => void;
  /** No position or no shop near enough: the parent shows the plain comparison. */
  onUnavailable: () => void;
  /** Shown under the list once there is one (the two-chain split, for instance). */
  more?: React.ReactNode;
}) {
  const [status, setStatus] = useState<Status>("locating");
  const [rows, setRows] = useState<Row[]>([]);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Read after mount: the static export has no storage at render time.
  const [priority, setPriority] = useState(25);
  useEffect(() => setPriority(readPriority()), []);
  const autoRead = useA11y((s) => s.autoRead);

  useEffect(() => {
    let alive = true;
    setStatus("locating");
    getCurrentPosition()
      .then((pos) => {
        if (alive) setHere(pos);
        return api.storesNearby(pos.lat, pos.lon, 10, 50);
      })
      .then((res) => {
        if (!alive) return;
        const found: Row[] = [];
        for (const basket of plan.by_store ?? []) {
          const branch = findBranch(res.items, basket.store);
          if (branch)
            found.push({
              basket,
              branch,
              store: basket.store,
              total: Number(basket.subtotal),
              km: branch.distance_km,
              items: basket.items.length,
            });
        }
        // A corner shop that sells 2 items of 33 is near but no answer: keep the
        // shops selling at least half of what the best-stocked one does.
        const most = Math.max(0, ...found.map((r) => r.items));
        const useful = found.filter((r) => r.items * 2 >= most);
        setRows(useful);
        setStatus(useful.length ? "ready" : "none");
        if (!useful.length) {
          useStoreAdvice.setState({ none: true });
          onUnavailable();
        }
      })
      // Location is required here: the whole point of this step is the shops
      // around you, so there is no answer without it — ask again instead.
      .catch(() => {
        if (alive) setStatus("denied");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per comparison or retry
  }, [plan, attempt]);

  const ranked = useMemo(() => rankStores(rows, priority, budget), [rows, priority, budget]);
  const best = ranked[0];
  const question = best
    ? `${best.store} est ${adviceReason(best, rows)} : ${eur(best.total)} à ${distance(best.km)}. On fait les courses chez ${best.store} ?`
    : "";

  // What is advised right now, for the voice assistant (a spoken "oui" = "Oui, X").
  const spoken = best
    ? `${best.store} est ${adviceReason(best, rows)} : ${spokenPrice(best.total)}, à ${spokenDistance(best.km)}. On fait les courses chez ${best.store} ?`
    : null;
  useEffect(() => {
    if (status !== "ready" || !best) return;
    useStoreAdvice.setState({ store: best.store, question, spoken, accept: () => onPick(best), none: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the advice
  }, [status, best, question, spoken]);
  useEffect(
    () => () => useStoreAdvice.setState({ store: null, question: null, spoken: null, accept: null, none: false }),
    [],
  );
  const voiceOpen = useA11y((s) => s.voiceOpen);

  // Said aloud once the shops are known, for anyone who asked to hear the pages
  // (not when the assistant is open: it asks the question itself).
  useEffect(() => {
    if (status === "ready" && best && autoRead && !voiceOpen) {
      speak(
        `${best.store} est ${adviceReason(best, rows)} : ${spokenPrice(best.total)}, à ${spokenDistance(best.km)}. On fait les courses chez ${best.store} ?`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the shops arrive, not on every slide
  }, [status]);

  if (status === "locating") {
    return (
      <div className="mt-3 space-y-2" role="status" aria-label="Je cherche les magasins autour de vous">
        <p className="flex items-center gap-2 text-body-md text-on-surface-variant">
          <Icon name="radar" className="animate-pulse text-primary" /> Je cherche les enseignes autour de vous…
        </p>
        {[0, 1, 2].map((k) => (
          <div key={k} className="card flex items-center gap-3 p-4">
            <span className="prixes-skeleton h-9 w-9 flex-shrink-0 rounded-xl" />
            <span className="flex-1 space-y-2">
              <span className="prixes-skeleton block h-3.5" style={{ width: `${65 - k * 10}%` }} />
              <span className="prixes-skeleton block h-3 w-1/3" />
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (status === "denied") {
    return (
      <div className="card mt-3 flex flex-col items-center gap-3 p-6 text-center" role="alert">
        <Icon name="location_on" className="text-[40px] text-primary" />
        <p className="text-headline-md text-on-surface">La localisation est nécessaire</p>
        <p className="text-body-md text-on-surface-variant">
          Prixes en a besoin pour trouver les magasins autour de vous et choisir le moins cher. Votre
          position n&apos;est jamais enregistrée.
        </p>
        <p className="text-body-md text-on-surface-variant">
          Si vous l&apos;avez refusée : Réglages de l&apos;iPhone › Prixes › Position › « Lorsque
          l&apos;app est active ».
        </p>
        <button onClick={() => setAttempt((n) => n + 1)} className="btn-primary w-full py-3">
          <Icon name="my_location" className="text-[20px]" /> Activer la localisation
        </button>
      </div>
    );
  }
  if (status === "none" || !best) return null; // the parent shows the comparison by chain

  const itemsTotal = plan.options[0]?.items_total ?? Math.max(...rows.map((r) => r.items));
  const shown = showAll ? ranked : ranked.slice(0, SHOWN);

  return (
    <div className="mt-3 space-y-4">
      {here && <Radar here={here} rows={ranked} best={best} />}

      <BudgetChip budget={budget} onBudget={onBudget} />

      <div>
        <label htmlFor="prio" className="flex justify-between text-label-md text-on-surface">
          <span>Le moins cher</span>
          <span>Le plus proche</span>
        </label>
        <input
          id="prio"
          type="range"
          min={0}
          max={100}
          step={5}
          value={priority}
          onChange={(e) => {
            const v = Number(e.target.value);
            setPriority(v);
            savePriority(v);
          }}
          aria-valuetext={priority < 35 ? "Priorité au prix" : priority > 65 ? "Priorité à la distance" : "Équilibre"}
          className="mt-1 h-11 w-full accent-[rgb(var(--color-on-surface))]"
        />
      </div>

      <ul className="space-y-2" aria-label="Enseignes autour de vous">
        {shown.map((r, i) => {
          const over = budget != null && r.total > budget;
          const advised = i === 0;
          return (
            <li key={r.store} className="prixes-rise" style={{ animationDelay: `${i * 60}ms` }}>
              <button
                onClick={() => onPick(r)}
                className={`grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors duration-300 ${
                  advised
                    ? "border-primary-container bg-primary-container/15"
                    : "border-outline-variant bg-surface-container-lowest"
                }`}
              >
                <span
                  aria-hidden
                  className="grid h-10 w-10 place-items-center rounded-xl bg-on-surface text-label-lg font-extrabold text-surface"
                >
                  {r.store.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 text-label-lg text-on-surface">
                    <span className="break-words">{r.store}</span>
                    {advised && (
                      <span className="rounded-md bg-on-surface px-1.5 py-0.5 text-micro font-extrabold uppercase tracking-wider text-surface">
                        Conseillé
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-micro text-on-surface-variant">
                    {distance(r.km)} · {r.items}/{itemsTotal} articles
                  </span>
                </span>
                <span className="text-right">
                  <span className={`block text-label-lg tabular-nums ${over ? "text-error" : "text-on-surface"}`}>
                    {eur(r.total)}
                  </span>
                  <span className={`block text-micro ${over ? "text-error" : "text-on-surface-variant"}`}>
                    {over ? "hors budget" : "votre liste"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* The assistant asks; it never chooses for you. */}
      <div className="rounded-2xl rounded-bl-md border border-outline-variant bg-surface-container-lowest p-4" role="status">
        <p className="text-micro font-extrabold uppercase tracking-wider text-on-surface-variant">Prixes</p>
        <p className="mt-1 text-body-md text-on-surface">{question}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onPick(best)} className="btn-primary flex-1 py-3">
          Oui, {best.store}
        </button>
        {ranked.length > SHOWN && !showAll && (
          <button onClick={() => setShowAll(true)} className="btn-outline flex-1 py-3">
            Autre enseigne
          </button>
        )}
      </div>
      {more}
    </div>
  );
}

/** The budget, said once and kept: "Budget 80 €", tap to change it. */
function BudgetChip({ budget, onBudget }: { budget: number | null; onBudget: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (editing) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(draft.replace(",", "."));
          onBudget(Number.isFinite(v) && v > 0 ? v : null);
          setEditing(false);
        }}
      >
        <label htmlFor="budget" className="text-label-md text-on-surface">
          Budget
        </label>
        <input
          id="budget"
          inputMode="decimal"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="80"
          className="input min-h-11 w-24"
        />
        <span className="text-label-md text-on-surface-variant">€</span>
        <button type="submit" className="btn-primary min-h-11 px-4">
          OK
        </button>
      </form>
    );
  }
  return (
    <button
      onClick={() => {
        setDraft(budget ? String(budget) : "");
        setEditing(true);
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-container px-4 text-label-md text-on-surface"
    >
      <Icon name="account_balance_wallet" className="text-[20px]" />
      {budget ? `Budget ${eur(budget)}` : "Fixer un budget"}
      <Icon name="edit" className="text-[16px] text-on-surface-variant" />
    </button>
  );
}

/** You in the middle, the shops around at their real bearing and distance. */
function Radar({ here, rows, best }: { here: { lat: number; lon: number }; rows: Row[]; best: Row }) {
  const maxKm = Math.max(0.5, ...rows.map((r) => r.km));
  const cos = Math.cos((here.lat * Math.PI) / 180);
  return (
    <div
      aria-hidden
      className="relative h-32 overflow-hidden rounded-2xl bg-surface-container"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 50%, rgb(var(--color-primary-container) / .35) 0 16%, transparent 17%), radial-gradient(circle at 50% 50%, transparent 0 36%, rgb(var(--color-outline-variant)) 36.5% 37%, transparent 37.5%), radial-gradient(circle at 50% 50%, transparent 0 64%, rgb(var(--color-outline-variant)) 64.5% 65%, transparent 65.5%)",
      }}
    >
      <span className="absolute left-1/2 top-1/2 -ml-2 -mt-2 h-4 w-4 rounded-full border-[3px] border-primary-container bg-on-surface" />
      {rows.slice(0, 8).map((r) => {
        const dx = (r.branch.lon - here.lon) * cos;
        const dy = r.branch.lat - here.lat;
        const len = Math.hypot(dx, dy) || 1;
        // Real bearing, distance scaled to the box; never on top of you.
        const reach = 0.35 + 0.65 * Math.min(1, r.km / maxKm);
        const x = 50 + (dx / len) * reach * 40;
        const y = 50 - (dy / len) * reach * 36;
        return (
          <span
            key={r.store}
            className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[11px] font-bold transition-colors duration-300 ${
              r === best
                ? "bg-primary-container text-on-primary-container shadow-glow"
                : "border border-outline-variant bg-surface-container-lowest text-on-surface"
            }`}
            style={{ left: `${Math.min(88, Math.max(12, x))}%`, top: `${Math.min(85, Math.max(15, y))}%` }}
          >
            {r.store.split(" ")[0]}
          </span>
        );
      })}
    </div>
  );
}
