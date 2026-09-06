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

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";

export type GeoState = "idle" | "asking" | "ready" | "denied";

const CACHE_KEY = "prixes.nearby.stores";
// A phone sees a handful of chains; more than that is noise for the ranking.
const MAX_STORES = 12;

function cached(): string[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null; // private mode, or a value written by an older version
  }
}

function remember(stores: string[]): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(stores));
  } catch {
    /* nothing to remember it with — we will simply ask again next page */
  }
}

export function useNearbyStores(): {
  stores: string[];
  state: GeoState;
  ask: () => void;
} {
  const [stores, setStores] = useState<string[]>([]);
  const [state, setState] = useState<GeoState>("idle");

  const load = useCallback(async () => {
    setState("asking");
    try {
      const { lat, lon } = await getCurrentPosition();
      const nearby = await api.storesNearby(lat, lon, 10, 40);
      // The chain is what a price is recorded against; the individual shop is not.
      const names = [
        ...new Set(nearby.items.map((s) => s.brand || s.name).filter(Boolean)),
      ].slice(0, MAX_STORES);
      setStores(names);
      setState("ready");
      remember(names);
    } catch {
      setState("denied");
    }
  }, []);

  useEffect(() => {
    const known = cached();
    if (known) {
      setStores(known);
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

  return { stores, state, ask: () => void load() };
}
