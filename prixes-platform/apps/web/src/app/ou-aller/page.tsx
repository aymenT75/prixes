"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import { InStoreGuide } from "@/components/InStoreGuide";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import {
  rankStores,
  rememberStore,
  rememberedStore,
  useGuideRequest,
} from "@/lib/courses";
import { distance, eur } from "@/lib/format";
import { getCurrentPosition } from "@/lib/geo";
import { useSpeakOnOpen } from "@/lib/say";
import { useApp } from "@/lib/store";
import { findBranch } from "@/lib/stores";
import type { ShoppingItem, Store, StoreBasketDetail } from "@/lib/types";
import { useA11y } from "@/lib/useA11y";
import { spokenDistance, spokenPrice } from "@/lib/voiceTasks";

/** OpenStreetMap can take a minute on a bad day: nobody should wait that long. */
const NEARBY_WAIT_MS = 12_000;

function nearbyOrNothing(lat: number, lon: number): Promise<Store[]> {
  return Promise.race([
    api.storesNearby(lat, lon, 10, 50).then((r) => r.items),
    new Promise<Store[]>((resolve) =>
      setTimeout(() => resolve([]), NEARBY_WAIT_MS)
    ),
  ]).catch(() => []);
}

interface Row {
  basket: StoreBasketDetail;
  /** Null when the map service gave nothing: the price is known, the distance is not. */
  branch: Store | null;
  store: string;
  total: number;
  km: number;
  items: number;
}

/** Products of the list this shop does not sell, not even an equivalent. */
function missingAt(basket: StoreBasketDetail, items: ShoppingItem[]): string[] {
  const here = new Set(basket.items.map((i) => i.barcode));
  const replaced = new Set(
    basket.items.map((i) => i.equivalent_of).filter(Boolean)
  );
  return items
    .filter((i) => !i.checked && !(i.barcode && here.has(i.barcode)))
    .map((i) => i.name ?? i.free_text ?? "")
    .filter((name) => name && !replaced.has(name));
}

/**
 * "Où aller": the cheapest shop around for the list, said aloud, and the nearest
 * one if it is another. Prices are per chain (Open Prices records them by store
 * brand); the distance is to that chain's nearest branch.
 */
export default function WherePage() {
  const { user, openLogin } = useApp();
  const qc = useQueryClient();
  const setVoiceOpen = useA11y((s) => s.setVoiceOpen);

  const { data: list } = useQuery({
    queryKey: ["shopping"],
    queryFn: () => api.getShoppingList(),
    enabled: !!user,
  });
  const items = useMemo(() => list?.items ?? [], [list]);
  const left = items.filter((i) => !i.checked).length;

  const [manual, setManual] = useState<{ lat: number; lon: number } | null>(
    null
  );
  const [attempt, setAttempt] = useState(0);
  const [lost, setLost] = useState(false);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [wantNearest, setWantNearest] = useState(false);
  const [guide, setGuide] = useState<StoreBasketDetail | null>(null);

  useEffect(() => {
    if (!user || !list || !left) return;
    let alive = true;
    setLost(false);
    setRows(null);
    void (async () => {
      let pos = manual;
      if (!pos) {
        try {
          pos = await getCurrentPosition();
        } catch {
          if (alive) setLost(true);
          return;
        }
      }
      if (alive) setHere(pos);
      try {
        const [plan, nearby] = await Promise.all([
          api.splitBasket(2),
          nearbyOrNothing(pos.lat, pos.lon),
        ]);
        const found: Row[] = [];
        for (const basket of plan.by_store ?? []) {
          const branch = findBranch(nearby, basket.store);
          // No shop known at all means the map service is down, not that the town has
          // none: the prices still stand. With a known map, an absent chain is left out.
          if (branch || !nearby.length)
            found.push({
              basket,
              branch,
              store: basket.store,
              total: Number(basket.subtotal),
              km: branch?.distance_km ?? 0,
              items: basket.items.length,
            });
        }
        // A corner shop that sells 2 items of 33 is near but no answer.
        const most = Math.max(0, ...found.map((r) => r.items));
        if (alive) setRows(found.filter((r) => r.items * 2 >= most));
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per list length, position or retry
  }, [user, !!list, left > 0, manual, attempt]);

  const cheapest = rows?.length ? rankStores(rows, 0, null)[0] : null;
  const nearest = rows?.length ? rankStores(rows, 100, null)[0] : null;
  const other =
    nearest?.branch && cheapest && nearest.store !== cheapest.store
      ? nearest
      : null;
  const shown = wantNearest && other ? other : cheapest;

  // "Guide-moi" said to the assistant: the shop chosen last time, or the cheapest.
  const guideAsked = useGuideRequest((s) => s.asked);
  useEffect(() => {
    if (!guideAsked || !rows?.length || !cheapest) return;
    useGuideRequest.setState({ asked: false });
    const wanted = rows.find((r) => r.store === rememberedStore()) ?? cheapest;
    rememberStore(wanted.store);
    setGuide(wanted.basket);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the shops are known
  }, [guideAsked, rows]);

  const partial = shown ? shown.items < left : false;
  const howMany = shown
    ? partial
      ? `pour ${shown.items} de vos ${left} produits`
      : `pour vos ${left} produit${left > 1 ? "s" : ""}`
    : "";

  const sentence =
    !user || guide
      ? null
      : list && !left
      ? "Votre liste est vide. Ajoutez d'abord des produits."
      : lost
      ? "Je n'ai pas pu vous localiser. Donnez votre ville."
      : rows && !shown
      ? "Je ne trouve pas de magasin près de vous pour cette liste."
      : shown && !shown.branch
      ? `Le moins cher est ${shown.store} : ${spokenPrice(
          shown.total
        )}, ${howMany}. Je ne peux pas vérifier la distance pour l'instant.`
      : shown
      ? `${wantNearest && other ? "Le plus proche" : "Le moins cher"} est ${
          shown.store
        }, à ${spokenDistance(shown.km)} : ${spokenPrice(
          shown.total
        )}, ${howMany}.` +
        (!wantNearest && other
          ? ` Le plus proche est ${other.store}, à ${spokenDistance(other.km)}.`
          : "")
      : null;
  useSpeakOnOpen(sentence);

  function goThere() {
    if (!shown) return;
    rememberStore(shown.store);
  }

  function startGuide() {
    if (!shown) return;
    rememberStore(shown.store);
    setGuide(shown.basket);
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Où aller" />
        <p className="text-[24px] leading-snug text-on-surface">
          Connectez-vous pour que je compare les magasins pour votre liste.
        </p>
        <button
          onClick={() => openLogin(true)}
          className="big-btn big-btn-main"
        >
          <Icon name="login" className="text-[44px]" /> Se connecter
        </button>
      </div>
    );
  }

  if (guide) {
    return (
      <InStoreGuide
        basket={guide}
        list={items}
        missing={missingAt(guide, items)}
        onTake={(id) =>
          void api
            .updateListItem(id, { checked: true })
            .then(() => qc.invalidateQueries({ queryKey: ["shopping"] }))
        }
        onClose={() => setGuide(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Où aller" />

      {list && !left && (
        <>
          <p className="text-[24px] leading-snug text-on-surface">
            Votre liste est vide. Ajoutez d&apos;abord des produits.
          </p>
          <button
            onClick={() => setVoiceOpen(true)}
            className="big-btn big-btn-main"
          >
            <Icon name="mic" className="text-[44px]" /> Ajouter
          </button>
        </>
      )}

      {!!left && !lost && !rows && (
        <p role="status" className="text-[24px] leading-snug text-on-surface">
          Je cherche les magasins autour de vous…
        </p>
      )}

      {!!left && lost && (
        <>
          <p role="alert" className="text-[24px] leading-snug text-on-surface">
            Je n&apos;ai pas pu vous localiser. Votre position n&apos;est jamais
            enregistrée.
          </p>
          <AddressPicker onPick={setManual} />
          <button onClick={() => setAttempt((n) => n + 1)} className="big-btn">
            <Icon name="my_location" className="text-[44px]" /> Réessayer
          </button>
        </>
      )}

      {!!left && !lost && rows && !shown && (
        <>
          <p role="alert" className="text-[24px] leading-snug text-on-surface">
            Je ne trouve pas de magasin près de vous pour cette liste.
          </p>
          <AddressPicker onPick={setManual} />
        </>
      )}

      {shown && (
        <>
          <section
            aria-live="polite"
            className="flex flex-col gap-1 text-on-surface"
          >
            <p className="text-[24px]">
              {wantNearest && other
                ? "Le plus proche de vous"
                : shown.branch
                ? "Le moins cher près de vous"
                : "Le moins cher"}
            </p>
            <h2 className="text-[34px] font-bold leading-tight">
              {shown.store}
              {shown.branch && `, à ${distance(shown.km)}`}
            </h2>
            <p className="text-[56px] font-bold leading-none tabular-nums">
              {eur(shown.total)}
            </p>
            <p className="text-[24px]">{howMany}</p>
            {!shown.branch && (
              <p className="text-[24px]">
                Je ne peux pas vérifier la distance pour l&apos;instant.
              </p>
            )}
          </section>

          <div className="mt-2 flex flex-col gap-3">
            <a
              href={
                shown.branch
                  ? `https://maps.apple.com/?daddr=${shown.branch.lat},${shown.branch.lon}&dirflg=w`
                  : `https://maps.apple.com/?q=${encodeURIComponent(
                      shown.store
                    )}${here ? `&sll=${here.lat},${here.lon}` : ""}`
              }
              target="_blank"
              rel="noreferrer"
              onClick={goThere}
              className="big-btn big-btn-main"
            >
              <Icon name="directions_walk" className="text-[44px]" />{" "}
              {shown.branch ? "Y aller" : "Voir sur le plan"}
            </a>
            {other && (
              <button
                onClick={() => setWantNearest((v) => !v)}
                className="big-btn"
              >
                <Icon name="swap_horiz" className="text-[44px]" />
                {wantNearest && cheapest ? (
                  <span>
                    Le moins cher
                    <small>
                      {cheapest.store}, {distance(cheapest.km)},{" "}
                      {eur(cheapest.total)}
                    </small>
                  </span>
                ) : (
                  <span>
                    Le plus proche
                    <small>
                      {other.store}, {distance(other.km)}, {eur(other.total)}
                    </small>
                  </span>
                )}
              </button>
            )}
            <button onClick={startGuide} className="big-btn">
              <Icon name="storefront" className="text-[44px]" /> Je suis au
              magasin
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** A town or an address, found as you type (OpenStreetMap, through our API). */
function AddressPicker({
  onPick,
}: {
  onPick: (c: { lat: number; lon: number }) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<
    { label: string; lat: number; lon: number }[]
  >([]);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .geocodeAddress(text)
        .then((r) => setHits(r.items.slice(0, 4)))
        .catch(() => setHits([]));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="where" className="text-[24px] font-bold text-on-surface">
        Votre ville ou adresse
      </label>
      <input
        id="where"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-h-[72px] w-full rounded-[18px] border-[3px] border-[rgb(var(--color-btn-line))] bg-surface-container-lowest px-4 text-[24px] text-on-surface"
        autoComplete="street-address"
      />
      {hits.map((h) => (
        <button
          key={`${h.lat},${h.lon}`}
          onClick={() => onPick({ lat: h.lat, lon: h.lon })}
          className="min-h-[72px] w-full rounded-[18px] border-2 border-[rgb(var(--color-btn-line))] bg-surface-container-lowest p-3 text-left text-[22px] text-on-surface"
        >
          {h.label.split(",").slice(0, 3).join(",")}
        </button>
      ))}
    </div>
  );
}
