"use client";

/**
 * Les enseignes autour de vous — sans redemander la permission à chaque page.
 *
 * Ranking search results by "the best price where you can actually go" needs a
 * position, and a position needs consent. Two rules keep that from being rude:
 *
 * A page never prompts on load. If the browser already remembers a grant, the
 * position is read silently; otherwise the caller renders a button and the
 * prompt happens on a deliberate tap.
 *
 * The answer is remembered for the session, so walking between Courses, the
 * store map and a product page asks once, not three times.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";
import { findBranch } from "@/lib/stores";
import type { Store } from "@/lib/types";

export type GeoState = "idle" | "asking" | "ready" | "denied";

const CACHE_KEY = "prixes.nearby.branches";
// A phone sees a handful of chains; more than that is noise for the ranking.
const MAX_STORES = 12;

function cached(): Store[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    // An older version of this cache held bare names. Ignore it rather than
    // crash on `s.brand` of a string.
    return Array.isArray(parsed) && parsed.every((s) => s && typeof s === "object")
      ? (parsed as Store[])
      : null;
  } catch {
    return null; // private mode, or a value written by an older version
  }
}

function remember(stores: Store[]): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(stores));
  } catch {
    /* nothing to remember it with — we will simply ask again next page */
  }
}

/** The chains around the caller, deduplicated, in the form prices are keyed by. */
function chains(stores: Store[]): string[] {
  return [...new Set(stores.map((s) => s.brand || s.name).filter(Boolean))].slice(
    0,
    MAX_STORES,
  );
}

export function useNearbyStores(): {
  /** Chain names, for the search ranking. */
  stores: string[];
  state: GeoState;
  ask: () => void;
  /** The nearest branch of a chain, so a result can say how far it is. */
  nearest: (chain: string | null | undefined) => Store | null;
} {
  const [nearby, setNearby] = useState<Store[]>([]);
  const [state, setState] = useState<GeoState>("idle");

  const load = useCallback(async () => {
    setState("asking");
    try {
      const { lat, lon } = await getCurrentPosition();
      const found = await api.storesNearby(lat, lon, 10, 40);
      setNearby(found.items);
      setState("ready");
      remember(found.items);
    } catch {
      setState("denied");
    }
  }, []);

  useEffect(() => {
    const known = cached();
    if (known) {
      setNearby(known);
      setState("ready");
      return;
    }
    // Only read a position the browser already agreed to give. Anything else
    // waits for the user to press the button.
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === "granted") void load();
      })
      .catch(() => {
        /* Permissions API unavailable (Safari, some WebViews) — stay idle */
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const stores = useMemo(() => chains(nearby), [nearby]);
  const nearest = useCallback(
    (chain: string | null | undefined) => (chain ? findBranch(nearby, chain) : null),
    [nearby],
  );

  return { stores, state, ask: () => void load(), nearest };
}
