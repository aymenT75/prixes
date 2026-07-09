"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import type { MapStore } from "@/components/StoreMap";
import { api } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";
import type { Store } from "@/lib/types";

// Leaflet is client-only (touches window); never SSR it.
const StoreMap = dynamic(() => import("@/components/StoreMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[60vh] place-items-center rounded-xl bg-surface-container-low">
      <Icon name="progress_activity" className="animate-spin text-[36px] text-primary" />
    </div>
  ),
});

// Normalise for loose brand matching: lowercase, strip accents + punctuation.
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Pick the nearest store (already distance-sorted) whose name/brand shares a
// significant token with the searched store name; fall back to the closest of all.
function pickBranch(stores: Store[], wanted: string): Store | null {
  if (stores.length === 0) return null;
  const wantTokens = new Set(norm(wanted).split(" ").filter((t) => t.length >= 3));
  if (wantTokens.size > 0) {
    const match = stores.find((s) => {
      const hay = new Set(norm(`${s.name} ${s.brand ?? ""}`).split(" "));
      return [...wantTokens].some((t) => hay.has(t));
    });
    if (match) return match;
  }
  return stores[0];
}

export default function StoreMapPage() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="Carte" back />
          <p className="py-10 text-center text-on-surface-variant">Chargement…</p>
        </div>
      }
    >
      <StoreMapView />
    </Suspense>
  );
}

function StoreMapView() {
  const params = useSearchParams();
  const wantedStore = params.get("store") ?? "";
  // Optional deep-link override: /stores/map?store=…&lat=…&lon=… skips geolocation
  // (shareable map links; also lets callers pass a known position).
  const latP = params.get("lat");
  const lonP = params.get("lon");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (latP && lonP && !Number.isNaN(+latP) && !Number.isNaN(+lonP)) {
      setCoords({ lat: +latP, lon: +lonP });
      return;
    }
    getCurrentPosition()
      .then(setCoords)
      .catch((e: unknown) =>
        setGeoError(
          e instanceof Error && e.message === "unsupported"
            ? "Géolocalisation non disponible."
            : "Position refusée. Activez la localisation pour voir la carte.",
        ),
      );
  }, [latP, lonP]);

  const { data, isFetching } = useQuery({
    queryKey: ["stores", "map", coords],
    // Wider net than the list view so a matching brand isn't cut off by the limit.
    queryFn: () => api.storesNearby(coords!.lat, coords!.lon, 15, 50),
    enabled: !!coords,
  });

  const branch = data ? pickBranch(data.items, wantedStore) : null;

  const title = wantedStore ? `${wantedStore} le plus proche` : "Magasin le plus proche";

  return (
    <div>
      <PageHeader title={title} back />

      {geoError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-warning-soft p-3 text-label-md text-secondary">
          <Icon name="warning" className="text-[18px]" /> {geoError}
        </div>
      )}

      {!geoError && (!coords || isFetching) && (
        <div className="grid h-[60vh] place-items-center rounded-xl bg-surface-container-low">
          <div className="flex flex-col items-center gap-2 text-on-surface-variant">
            <Icon name="progress_activity" className="animate-spin text-[36px] text-primary" />
            <p className="text-body-md">Recherche du magasin le plus proche…</p>
          </div>
        </div>
      )}

      {coords && !isFetching && branch && (
        <StoreMap
          user={coords}
          store={branch as MapStore}
        />
      )}

      {coords && !isFetching && !branch && (
        <p className="py-10 text-center text-on-surface-variant">
          Aucun magasin trouvé à proximité.
        </p>
      )}
    </div>
  );
}
