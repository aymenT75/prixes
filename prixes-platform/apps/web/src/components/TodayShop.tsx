"use client";

/**
 * "Où fait-on nos courses aujourd'hui ?" answered before it is asked: on
 * opening, the home page has already priced the list in the chains around
 * you and names the one it advises — said aloud once a day for anyone who
 * listens to the pages. "On y va" opens the list at that shop; an empty list
 * gets the week's shopping prepared instead.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { adviceReason, rankStores, readPriority, rememberStore, type Candidate } from "@/lib/courses";
import { distance, eur } from "@/lib/format";
import { getCurrentPosition } from "@/lib/geo";
import { useApp } from "@/lib/store";
import { findBranch } from "@/lib/stores";
import type { Store } from "@/lib/types";
import { useA11y } from "@/lib/useA11y";
import { speak } from "@/lib/voice";
import { spokenDistance, spokenPrice, useVoiceTask } from "@/lib/voiceTasks";

interface Row extends Candidate {
  branch: Store;
}

type Geo = "locating" | "ready" | "denied";

const SAID_KEY = "prixes.home.said";

function Panel({ who, children }: { who: string; children: React.ReactNode }) {
  return (
    <section
      aria-label="Votre prochaine course"
      data-tour="today"
      className="prixes-rise mb-5 flex flex-col gap-3 rounded-3xl bg-on-surface p-5 text-surface dark:bg-surface-container-high dark:text-on-surface"
    >
      <p className="flex items-center gap-2 text-micro font-extrabold uppercase tracking-widest text-primary-container">
        <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-primary-container" />
        {who}
      </p>
      {children}
    </section>
  );
}

export function TodayShop() {
  const router = useRouter();
  const { user, openLogin } = useApp();
  const setVoiceOpen = useA11y((s) => s.setVoiceOpen);
  const autoRead = useA11y((s) => s.autoRead);
  const [later, setLater] = useState(false);

  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: ["shopping"],
    queryFn: () => api.getShoppingList(),
    enabled: !!user,
  });
  const toBuy = (list?.items ?? []).filter((i) => !i.checked);

  const { data: plan } = useQuery({
    queryKey: ["split-home", toBuy.length],
    queryFn: () => api.splitBasket(2),
    enabled: !!user && toBuy.length > 0,
    staleTime: 10 * 60_000,
  });
  const { data: month } = useQuery({
    queryKey: ["budget"],
    queryFn: () => api.getBudget(),
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });

  // Where you are, then the branches of each chain around you.
  const [geo, setGeo] = useState<Geo>("locating");
  const [stores, setStores] = useState<Store[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!user || !plan?.by_store?.length) return;
    let alive = true;
    setGeo("locating");
    getCurrentPosition()
      .then((pos) => api.storesNearby(pos.lat, pos.lon, 10, 50))
      .then((res) => {
        if (!alive) return;
        setStores(res.items);
        setGeo("ready");
      })
      .catch(() => alive && setGeo("denied"));
    return () => {
      alive = false;
    };
  }, [user, plan, attempt]);

  const rows = useMemo<Row[]>(() => {
    if (!plan?.by_store || !stores) return [];
    const found: Row[] = [];
    for (const b of plan.by_store) {
      const branch = findBranch(stores, b.store);
      if (branch)
        found.push({ store: b.store, total: Number(b.subtotal), km: branch.distance_km, items: b.items.length, branch });
    }
    const most = Math.max(0, ...found.map((r) => r.items));
    return found.filter((r) => r.items * 2 >= most);
  }, [plan, stores]);

  const left = month?.left != null ? Number(month.left) : null;
  // Read after mount: the static export has no storage at render time.
  const [priority, setPriority] = useState(25);
  useEffect(() => setPriority(readPriority()), []);
  const ranked = useMemo(() => rankStores(rows, priority, left), [rows, priority, left]);
  const best = ranked[0];
  // The saving: against the dearest shop nearby that sells as much of the list.
  const rival = best
    ? ranked.filter((r) => r !== best && r.items >= best.items).reduce<Row | null>((a, b) => (!a || b.total > a.total ? b : a), null)
    : null;
  const saving = best && rival ? Math.round((rival.total - best.total) * 100) / 100 : 0;
  const listCount = toBuy.length;

  // Said once a day, for anyone who listens to the pages.
  useEffect(() => {
    if (!best || !autoRead) return;
    const today = new Date().toDateString();
    try {
      if (localStorage.getItem(SAID_KEY) === today) return;
      localStorage.setItem(SAID_KEY, today);
    } catch {
      /* storage blocked: say it anyway */
    }
    speak(
      `Aujourd'hui, le mieux est ${best.store}, à ${spokenDistance(best.km)} : ${spokenPrice(best.total)} pour votre liste.` +
        (saving > 0 && rival ? ` ${spokenPrice(saving)} de moins que chez ${rival.store}.` : "") +
        " On y va ?",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once the answer is known
  }, [best?.store]);

  if (!user) {
    return (
      <Panel who="Votre assistant courses">
        <p className="text-[17px] font-semibold leading-snug">
          Dites-moi ce qu&apos;il vous faut : je trouve le magasin le moins cher près de chez vous et je vous y guide.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setVoiceOpen(true)} className="btn-primary py-3">
            <Icon name="mic" fill className="text-[20px]" /> Parler
          </button>
          <button onClick={() => openLogin(true)} className="min-h-11 rounded-full bg-surface/15 py-3 text-label-lg font-bold">
            Se connecter
          </button>
        </div>
      </Panel>
    );
  }

  if (listLoading) {
    return (
      <Panel who="Prixes regarde">
        <span className="prixes-skeleton block h-4 w-4/5 opacity-40" />
        <span className="prixes-skeleton block h-4 w-3/5 opacity-40" />
      </Panel>
    );
  }

  if (listCount === 0) {
    if (later) return null;
    return (
      <Panel who="Votre liste est vide">
        <p className="text-[17px] font-semibold leading-snug">
          Je vous prépare celle de la semaine ? Les repas, vos habitudes et les promos du moment.
        </p>
        <div className="grid grid-cols-[1.3fr_1fr] gap-2">
          <button
            onClick={() => {
              useVoiceTask.getState().queue({ kind: "cart", prompt: "les courses de la semaine" });
              router.push("/list");
            }}
            className="btn-primary py-3"
          >
            Oui, prépare-la
          </button>
          <button onClick={() => setLater(true)} className="min-h-11 rounded-full bg-surface/15 py-3 text-label-lg font-bold">
            Plus tard
          </button>
        </div>
      </Panel>
    );
  }

  if (geo === "denied") {
    return (
      <Panel who="Où faire vos courses">
        <p className="text-[17px] font-semibold leading-snug">
          Activez la localisation : je trouverai le magasin le moins cher pour vos {listCount} articles.
        </p>
        <button onClick={() => setAttempt((n) => n + 1)} className="btn-primary py-3">
          <Icon name="my_location" className="text-[20px]" /> Activer la localisation
        </button>
      </Panel>
    );
  }

  if (!best) {
    return (
      <Panel who="Prixes regarde">
        <p className="text-[17px] font-semibold leading-snug">
          Je compare les magasins autour de vous pour vos {listCount} articles…
        </p>
        {geo === "ready" && plan && rows.length === 0 && (
          <button onClick={() => router.push("/list?etape=2")} className="btn-primary py-3">
            Voir la comparaison
          </button>
        )}
      </Panel>
    );
  }

  const covered = best.items < listCount ? `${best.items} de vos ${listCount} articles` : `vos ${listCount} articles`;
  return (
    <Panel who="Prixes a déjà regardé">
      <p className="text-[18px] font-semibold leading-snug">
        Chez <b className="font-display text-primary-container">{best.store}</b>, à {distance(best.km)} :{" "}
        <b className="font-display text-primary-container">{eur(best.total)}</b> pour {covered}.
        {saving > 0 && rival && (
          <>
            {" "}
            {eur(saving)} de moins que chez {rival.store}.
          </>
        )}
      </p>
      <p className="text-body-md opacity-80">C&apos;est {adviceReason(best, ranked)} près de chez vous.</p>
      <div className="grid grid-cols-[1.3fr_1fr] gap-2">
        <button
          onClick={() => {
            rememberStore(best.store);
            router.push(`/list?etape=2&magasin=${encodeURIComponent(best.store)}`);
          }}
          className="btn-primary py-3"
        >
          On y va
        </button>
        <button
          onClick={() => router.push("/list?etape=2")}
          className="min-h-11 rounded-full bg-surface/15 py-3 text-label-lg font-bold dark:bg-on-surface/10"
        >
          Autre magasin
        </button>
      </div>
    </Panel>
  );
}
